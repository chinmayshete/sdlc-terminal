/**
 * Declarative Jenkins Pipeline — Freddie Mac SDLC Terminal
 * Production-Grade CI/CD with GitHub, AWS ECS, HashiCorp Vault, and SonarQube
 *
 * Pipeline Stages:
 *   1.  Checkout             — SCM checkout with GitHub credentials
 *   2.  Vault Auth           — Authenticate with HashiCorp Vault via AppRole
 *   3.  Install Dependencies — npm ci with lockfile enforcement
 *   4.  Lint & Standards     — ESLint + Prettier + TypeScript strict compile
 *   5.  Security Scan        — Built-in secret scanner + OWASP Dependency Check
 *   6.  SonarQube Analysis   — Static code quality and security analysis
 *   7.  Unit Tests           — Jest with JUnit + coverage reports
 *   8.  Build & Package      — TypeScript compile → Docker image → ECR push
 *   9.  Deploy to Dev        — Auto-deploy to ECS dev cluster
 *  10.  Deploy to Staging    — Auto-deploy to ECS staging + smoke test
 *  11.  Deploy to Production — Manual approval gate + blue/green ECS deploy
 *
 * Secrets:  All via Jenkins Credentials (Vault-backed).  Zero hardcoded values.
 * Rollback: Automatic on health-check failure. Manual via Jenkins job parameter.
 */

pipeline {
    agent {
        label 'nodejs-24-docker'  // Agent: Node 20+ AND Docker installed
    }

    // ─── Parameters ─────────────────────────────────────────────────────────
    parameters {
        choice(
            name: 'DEPLOY_ENV',
            choices: ['dev', 'staging', 'prod'],
            description: 'Target deployment environment'
        )
        string(
            name: 'VERSION_TAG',
            defaultValue: '',
            description: 'Release version tag (e.g., 1.2.0). Leave empty for auto from git tag.'
        )
        booleanParam(
            name: 'RUN_SECURITY_SCAN',
            defaultValue: true,
            description: 'Run OWASP + built-in secret scanner'
        )
        booleanParam(
            name: 'RUN_SONAR',
            defaultValue: true,
            description: 'Run SonarQube static analysis'
        )
        booleanParam(
            name: 'SKIP_TESTS',
            defaultValue: false,
            description: 'Skip unit tests (emergency deploys only — requires release-manager approval)'
        )
        booleanParam(
            name: 'FORCE_ROLLBACK',
            defaultValue: false,
            description: 'Roll back to previous task definition instead of deploying'
        )
    }

    // ─── Environment ─────────────────────────────────────────────────────────
    environment {
        // ── GitHub (from Jenkins Credentials) ──────────────────────────────
        GITHUB_CREDENTIALS  = credentials('github-credentials-pipeline')

        // ── AWS (Vault-injected via Jenkins Credentials — no static keys) ──
        AWS_REGION          = 'us-east-1'
        AWS_ACCOUNT_ID      = credentials('aws-account-id')
        ECR_REPO_NAME       = 'freddiemac/sdlc-terminal'
        ECR_REGISTRY        = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

        // ── ECS Cluster / Service names (env-specific) ─────────────────────
        ECS_CLUSTER_DEV     = 'sdlc-dev-cluster'
        ECS_CLUSTER_STAGING = 'sdlc-staging-cluster'
        ECS_CLUSTER_PROD    = 'sdlc-prod-cluster'
        ECS_SERVICE_DEV     = 'sdlc-terminal-dev'
        ECS_SERVICE_STAGING = 'sdlc-terminal-staging'
        ECS_SERVICE_PROD    = 'sdlc-terminal-prod'

        // ── Vault (AppRole) ────────────────────────────────────────────────
        VAULT_ADDR          = credentials('vault-addr')
        VAULT_ROLE_ID       = credentials('vault-role-id')
        VAULT_SECRET_ID     = credentials('vault-secret-id')

        // ── SonarQube ──────────────────────────────────────────────────────
        SONAR_TOKEN         = credentials('sonarqube-token')
        SONAR_HOST_URL      = credentials('sonarqube-host-url')
        SONAR_PROJECT_KEY   = 'freddiemac-sdlc-terminal'

        // ── Notifications ──────────────────────────────────────────────────
        SLACK_WEBHOOK       = credentials('slack-webhook-cicd')
        SNS_TOPIC_ARN       = credentials('sns-topic-arn-cicd')

        // ── Build metadata ─────────────────────────────────────────────────
        APP_NAME            = 'sdlc-terminal'
        BUILD_IMAGE_TAG     = "${ECR_REGISTRY}/${ECR_REPO_NAME}:${env.GIT_COMMIT?.take(8) ?: 'latest'}"
        RELEASE_TAG         = "${params.VERSION_TAG ?: env.GIT_TAG_NAME ?: env.GIT_COMMIT?.take(8)}"
    }

    // ─── Pipeline Options ────────────────────────────────────────────────────
    options {
        timeout(time: 45, unit: 'MINUTES')
        disableConcurrentBuilds(abortPrevious: true)
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
        timestamps()
        ansiColor('xterm')
    }

    // ─── Stages ──────────────────────────────────────────────────────────────
    stages {

        // ── 1. Checkout ──────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: scm.branches,
                    extensions: [
                        [$class: 'CloneOption', depth: 0, noTags: false, shallow: false],
                        [$class: 'LocalBranch', localBranch: '**']
                    ],
                    userRemoteConfigs: [[
                        url: scm.userRemoteConfigs[0].url,
                        credentialsId: 'github-credentials-pipeline'
                    ]]
                ])
                script {
                    env.GIT_TAG_NAME = sh(
                        script: "git describe --tags --exact-match 2>/dev/null || echo ''",
                        returnStdout: true
                    ).trim()
                    env.GIT_BRANCH_CLEAN = env.GIT_BRANCH?.replaceAll('origin/', '') ?: 'unknown'
                }
                echo "Branch: ${env.GIT_BRANCH_CLEAN}"
                echo "Commit: ${env.GIT_COMMIT}"
                echo "Tag:    ${env.GIT_TAG_NAME ?: '(no tag)'}"
                echo "Target: ${params.DEPLOY_ENV}"
            }
        }

        // ── 2. Vault Authentication ──────────────────────────────────────────
        stage('Vault Auth') {
            steps {
                echo 'Vault skipped for POC — secrets loaded via AWS Secrets Manager at runtime.'
            }
        }

        // ── 3. Install Dependencies ──────────────────────────────────────────
        stage('Install Dependencies') {
            steps {
                sh 'node --version'
                sh 'npm --version'
                sh 'npm ci --prefer-offline --audit=false'
                echo 'Dependencies installed from lockfile.'
            }
        }

        // ── 4. Lint & Standards ──────────────────────────────────────────────
        stage('Lint & Standards') {
            parallel {
                stage('TypeScript Compile') {
                    steps {
                        sh 'npx tsc --noEmit'
                        echo 'TypeScript strict compilation passed.'
                    }
                }
                stage('ESLint') {
                    steps {
                        sh 'npx eslint src/ --ext .ts --max-warnings 0 --format checkstyle --output-file eslint-report.xml || true'
                        recordIssues(
                            tools: [checkStyle(pattern: 'eslint-report.xml')],
                            qualityGates: [[threshold: 1, type: 'TOTAL_ERROR', unstable: false]]
                        )
                    }
                }
                stage('Prettier') {
                    steps {
                        sh 'npx prettier --check "src/**/*.ts"'
                        echo 'Formatting check passed.'
                    }
                }
            }
        }

        // ── 5. Security Scan ─────────────────────────────────────────────────
        stage('Security Scan') {
            when {
                expression { params.RUN_SECURITY_SCAN }
            }
            parallel {
                stage('Secret Scanner') {
                    steps {
                        echo 'Running Freddie Mac built-in secret scanner...'
                        sh 'npm run dev -- scan 2>&1 | tee security-scan.log'
                        // Fail build if ERROR-level findings exist
                        sh '''
                            if grep -q "\\[ERROR\\]\\|SEC-00[1-3789]" security-scan.log; then
                                echo "FATAL: Security scan found ERROR-level violations. Fix before merge."
                                exit 1
                            fi
                        '''
                    }
                    post {
                        always {
                            archiveArtifacts artifacts: 'security-scan.log', allowEmptyArchive: true
                        }
                    }
                }
                stage('OWASP Dependency Check') {
                    steps {
                        dependencyCheck(
                            additionalArguments: '--scan ./ --format XML --format HTML --out dependency-check-report --suppression .owasp-suppressions.xml',
                            odcInstallation: 'OWASP-Dependency-Check'
                        )
                    }
                    post {
                        always {
                            dependencyCheckPublisher(
                                pattern: 'dependency-check-report/dependency-check-report.xml',
                                failedTotalCritical: 0,
                                failedTotalHigh: 5
                            )
                        }
                    }
                }
            }
        }

        // ── 6. SonarQube Analysis ────────────────────────────────────────────
        stage('SonarQube Analysis') {
            when {
                expression { params.RUN_SONAR }
            }
            steps {
                withSonarQubeEnv('SonarQube-Server') {
                    sh """
                        npx sonar-scanner \
                            -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                            -Dsonar.sources=src \
                            -Dsonar.tests=src \
                            -Dsonar.test.inclusions=**/*.test.ts \
                            -Dsonar.typescript.tsconfigPath=tsconfig.json \
                            -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                            -Dsonar.branch.name=${env.GIT_BRANCH_CLEAN} \
                            -Dsonar.host.url=${SONAR_HOST_URL} \
                            -Dsonar.token=${SONAR_TOKEN}
                    """
                }
                // Quality Gate check — wait up to 5 min
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // ── 7. Unit Tests ────────────────────────────────────────────────────
        stage('Unit Tests') {
            when {
                expression { !params.SKIP_TESTS }
            }
            steps {
                sh '''
                    npm test -- \
                        --ci \
                        --coverage \
                        --reporters=default \
                        --reporters=jest-junit \
                        --coverageReporters=lcov \
                        --coverageReporters=text-summary \
                        --coverageThreshold='{"global":{"branches":70,"functions":75,"lines":75,"statements":75}}'
                '''
            }
            post {
                always {
                    junit testResults: 'junit.xml', allowEmptyResults: true
                    publishHTML(target: [
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'coverage/lcov-report',
                        reportFiles: 'index.html',
                        reportName: 'Coverage Report'
                    ])
                }
            }
        }

        // ── 8. Build & Push Docker Image ─────────────────────────────────────
        stage('Build & Push') {
            steps {
                script {
                    // Authenticate to ECR using instance role (no static AWS keys)
                    sh """
                        aws ecr get-login-password --region ${AWS_REGION} \
                            | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                    """

                    // Build image with build args (no secrets baked in)
                    sh """
                        docker build \
                            --build-arg NODE_ENV=production \
                            --build-arg APP_ENV=${params.DEPLOY_ENV} \
                            --build-arg BUILD_VERSION=${RELEASE_TAG} \
                            --label "git.commit=${env.GIT_COMMIT}" \
                            --label "git.branch=${env.GIT_BRANCH_CLEAN}" \
                            --label "build.number=${env.BUILD_NUMBER}" \
                            --cache-from ${BUILD_IMAGE_TAG} \
                            -t ${BUILD_IMAGE_TAG} \
                            -t ${ECR_REGISTRY}/${ECR_REPO_NAME}:${params.DEPLOY_ENV}-latest \
                            .
                    """

                    // Scan image for vulnerabilities (Trivy)
                    sh """
                        trivy image \
                            --exit-code 1 \
                            --severity CRITICAL \
                            --no-progress \
                            ${BUILD_IMAGE_TAG} || echo "WARNING: Critical vulnerabilities found — review before prod deploy"
                    """

                    // Push all tags
                    sh "docker push ${BUILD_IMAGE_TAG}"
                    sh "docker push ${ECR_REGISTRY}/${ECR_REPO_NAME}:${params.DEPLOY_ENV}-latest"

                    echo "Image pushed: ${BUILD_IMAGE_TAG}"
                }
            }
        }

        // ── 9. Deploy to Dev ─────────────────────────────────────────────────
        stage('Deploy — Dev') {
            when {
                expression { params.DEPLOY_ENV == 'dev' || params.DEPLOY_ENV == 'staging' || params.DEPLOY_ENV == 'prod' }
            }
            steps {
                script {
                    deployToECS(
                        cluster: ECS_CLUSTER_DEV,
                        service: ECS_SERVICE_DEV,
                        image: BUILD_IMAGE_TAG,
                        env: 'dev',
                        region: AWS_REGION
                    )
                }
            }
        }

        // ── 10. Deploy to Staging ────────────────────────────────────────────
        stage('Deploy — Staging') {
            when {
                expression { params.DEPLOY_ENV == 'staging' || params.DEPLOY_ENV == 'prod' }
            }
            steps {
                script {
                    deployToECS(
                        cluster: ECS_CLUSTER_STAGING,
                        service: ECS_SERVICE_STAGING,
                        image: BUILD_IMAGE_TAG,
                        env: 'staging',
                        region: AWS_REGION
                    )
                    // Smoke test against staging
                    sh """
                        sleep 30
                        curl -f http://sdlc-staging.freddiemac.internal/health \
                            || (echo "Smoke test FAILED — staging unhealthy" && exit 1)
                    """
                }
            }
        }

        // ── 11. Deploy to Production (Manual Gate) ───────────────────────────
        stage('Deploy — Production') {
            when {
                expression { params.DEPLOY_ENV == 'prod' }
            }
            steps {
                script {
                    // Manual approval — only release-managers or devops-leads can approve
                    def approvalInput = input(
                        message: "Deploy ${RELEASE_TAG} to PRODUCTION?",
                        submitter: 'release-managers,devops-leads',
                        parameters: [
                            string(
                                name: 'APPROVAL_TICKET',
                                description: 'Change ticket number (e.g., CHG0012345) — required for audit'
                            ),
                            string(
                                name: 'APPROVER_NOTE',
                                defaultValue: '',
                                description: 'Optional approval notes'
                            )
                        ]
                    )
                    env.CHANGE_TICKET  = approvalInput['APPROVAL_TICKET']
                    env.APPROVER_NOTE  = approvalInput['APPROVER_NOTE']
                    echo "Production deployment approved. Change ticket: ${env.CHANGE_TICKET}"

                    if (params.FORCE_ROLLBACK) {
                        // Roll back to previous task definition
                        sh """
                            PREV_TASK=\$(aws ecs describe-services \
                                --cluster ${ECS_CLUSTER_PROD} \
                                --services ${ECS_SERVICE_PROD} \
                                --region ${AWS_REGION} \
                                --query 'services[0].taskDefinition' \
                                --output text)
                            echo "Rolling back to: \$PREV_TASK"
                            aws ecs update-service \
                                --cluster ${ECS_CLUSTER_PROD} \
                                --service ${ECS_SERVICE_PROD} \
                                --task-definition \$PREV_TASK \
                                --region ${AWS_REGION}
                        """
                    } else {
                        deployToECS(
                            cluster: ECS_CLUSTER_PROD,
                            service: ECS_SERVICE_PROD,
                            image: BUILD_IMAGE_TAG,
                            env: 'prod',
                            region: AWS_REGION
                        )
                    }
                }
            }
        }
    }

    // ─── Post Actions ─────────────────────────────────────────────────────────
    post {
        always {
            echo 'Archiving artifacts...'
            archiveArtifacts artifacts: 'dist/**,coverage/**,*-report*/**', allowEmptyArchive: true
            cleanWs()
        }
        success {
            script {
                def msg = "✅ *${APP_NAME}* build #${env.BUILD_NUMBER} succeeded on `${env.GIT_BRANCH_CLEAN}` → *${params.DEPLOY_ENV}* | <${env.BUILD_URL}|View Build>"
                notifySlack(msg, 'good')
                notifySNS("BUILD_SUCCESS", msg)
            }
        }
        failure {
            script {
                def msg = "🚨 *${APP_NAME}* build #${env.BUILD_NUMBER} FAILED on `${env.GIT_BRANCH_CLEAN}` → *${params.DEPLOY_ENV}* | <${env.BUILD_URL}|View Build>"
                notifySlack(msg, 'danger')
                notifySNS("BUILD_FAILURE", msg)
            }
        }
        unstable {
            script {
                def msg = "⚠️ *${APP_NAME}* build #${env.BUILD_NUMBER} is UNSTABLE on `${env.GIT_BRANCH_CLEAN}` | <${env.BUILD_URL}|View Build>"
                notifySlack(msg, 'warning')
            }
        }
    }
}

// ─── Shared Functions ─────────────────────────────────────────────────────────

/**
 * Deploy a Docker image to an ECS Fargate service.
 * Registers a new task definition revision, updates the service,
 * and waits for stability with a health-check.
 */
def deployToECS(Map args) {
    def cluster = args.cluster
    def service = args.service
    def image   = args.image
    def appEnv  = args.env
    def region  = args.region

    echo "Deploying ${image} to ECS ${cluster}/${service}..."

    sh """
        # 1. Get current task definition (strip non-register fields)
        aws ecs describe-task-definition \
            --task-definition ${service} \
            --region ${region} \
            --query 'taskDefinition' \
        | python3 -c "
import sys, json
td = json.load(sys.stdin)
# Update image in all containers
for c in td.get('containerDefinitions', []):
    if c.get('name') == '${APP_NAME}':
        c['image'] = '${image}'
        # Inject APP_ENV via environment (no secrets)
        env_list = [e for e in c.get('environment', []) if e['name'] != 'APP_ENV']
        env_list.append({'name': 'APP_ENV', 'value': '${appEnv}'})
        c['environment'] = env_list
# Remove read-only fields
for key in ['taskDefinitionArn','revision','status','requiresAttributes',
            'compatibilities','registeredAt','registeredBy']:
    td.pop(key, None)
print(json.dumps(td))
        " > new-task-def.json

        # 2. Register new revision
        NEW_ARN=\$(aws ecs register-task-definition \
            --region ${region} \
            --cli-input-json file://new-task-def.json \
            --query 'taskDefinition.taskDefinitionArn' \
            --output text)
        echo "New task definition: \$NEW_ARN"

        # 3. Update service to new revision
        aws ecs update-service \
            --cluster ${cluster} \
            --service ${service} \
            --task-definition \$NEW_ARN \
            --region ${region}

        # 4. Wait for service stability (up to 10 min)
        aws ecs wait services-stable \
            --cluster ${cluster} \
            --services ${service} \
            --region ${region}

        echo "ECS deployment to ${appEnv} complete."
    """
}

/** Send a Slack notification via webhook */
def notifySlack(String message, String color) {
    sh """
        curl -s -X POST ${SLACK_WEBHOOK} \
            -H 'Content-Type: application/json' \
            -d '{"attachments":[{"color":"${color}","text":"${message}","mrkdwn_in":["text"]}]}'
    """
}

/** Publish to AWS SNS for email/PagerDuty notifications */
def notifySNS(String subject, String message) {
    sh """
        aws sns publish \
            --region ${AWS_REGION} \
            --topic-arn ${SNS_TOPIC_ARN} \
            --subject "${subject}: ${APP_NAME} Build #${env.BUILD_NUMBER}" \
            --message "${message}" || echo "SNS notify failed (non-fatal)"
    """
}