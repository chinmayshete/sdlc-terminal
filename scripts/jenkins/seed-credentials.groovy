#!/usr/bin/env groovy
/**
 * Jenkins Credentials Setup — Freddie Mac SDLC Terminal
 *
 * Run this once in Jenkins Script Console (Manage Jenkins → Script Console)
 * to seed all required credentials from your secrets manager.
 *
 * Alternatively use Jenkins Configuration as Code (JCasC) plugin
 * with the yaml file provided (jenkins/jenkins-casc.yaml).
 */

import com.cloudbees.plugins.credentials.impl.*
import com.cloudbees.plugins.credentials.*
import com.cloudbees.plugins.credentials.domains.*
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl
import hudson.util.Secret

def store = SystemCredentialsProvider.getInstance().getStore()
def domain = Domain.global()

// Helper to add a string credential
def addString(String id, String description, String secret) {
    def cred = new StringCredentialsImpl(
        CredentialsScope.GLOBAL,
        id,
        description,
        Secret.fromString(secret)
    )
    store.addCredentials(domain, cred)
    println("✅ Added credential: ${id}")
}

// Helper to add username+password credential
def addUserPass(String id, String description, String user, String pass) {
    def cred = new UsernamePasswordCredentialsImpl(
        CredentialsScope.GLOBAL,
        id,
        description,
        user,
        pass
    )
    store.addCredentials(domain, cred)
    println("✅ Added credential: ${id}")
}

// ─── Replace placeholder values below with your actual secrets ───────────────
// DO NOT commit this file with real values — use Vault or SSM to inject them

// GitHub App credentials
addUserPass(
    'github-app-credentials',
    'GitHub App — Freddie Mac SDLC repo access',
    'x-access-token',
    System.getenv('GITHUB_TOKEN') ?: 'REPLACE_WITH_GITHUB_PAT'
)

// AWS (account ID only — actual access via EC2/ECS IAM role)
addString('aws-account-id',   'AWS Account ID',   System.getenv('AWS_ACCOUNT_ID')   ?: 'REPLACE')

// Vault (AppRole)
addString('vault-addr',       'HashiCorp Vault URL',       System.getenv('VAULT_ADDR')       ?: 'https://vault.freddiemac.internal')
addString('vault-role-id',    'Vault AppRole Role ID',     System.getenv('VAULT_ROLE_ID')    ?: 'REPLACE')
addString('vault-secret-id',  'Vault AppRole Secret ID',   System.getenv('VAULT_SECRET_ID')  ?: 'REPLACE')

// SonarQube
addString('sonarqube-token',    'SonarQube Analysis Token', System.getenv('SONAR_TOKEN')    ?: 'REPLACE')
addString('sonarqube-host-url', 'SonarQube Host URL',       System.getenv('SONAR_HOST_URL') ?: 'https://sonar.freddiemac.internal')

// Notifications
addString('slack-webhook-cicd', 'Slack Webhook — CI/CD Channel',    System.getenv('SLACK_WEBHOOK') ?: 'REPLACE')
addString('sns-topic-arn-cicd', 'SNS Topic ARN — CI/CD Notifications', System.getenv('SNS_TOPIC_ARN') ?: 'REPLACE')

println("\n✅ All credentials seeded. Verify at: Manage Jenkins → Credentials")
println("⚠️  Ensure Jenkins EC2 instance has an IAM role with ECR push + ECS deploy permissions.")
