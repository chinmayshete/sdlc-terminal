################################################################################
# Terraform Configuration — Freddie Mac SDLC Terminal
#
# This configuration defines the core infrastructure for the SDLC POC, 
# including the ECR repository for Docker images and basic IAM roles.
################################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # --- Local/S3 Backend ---
  # In production, use an S3 bucket with DynamoDB locking.
  # backend "s3" {
  #   bucket         = "freddie-mac-terraform-state"
  #   key            = "sdlc/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-lock"
  # }
  
  # --- S3 Backend (Production Ready) ---
  backend "s3" {
    bucket         = "freddie-mac-terraform-state"
    key            = "sdlc/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# --- Variables ---

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource tagging"
  type        = string
  default     = "freddie-mac-sdlc"
}

# --- Elastic Container Registry (ECR) ---

resource "aws_ecr_repository" "sdlc_repo" {
  name                 = "sdlc-terminal"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
  }

  tags = {
    Project     = var.project_name
    Environment = "POC"
    Compliance  = "Enterprise"
  }
}

# --- IAM Roles for Jenkins / CI/CD ---

resource "aws_iam_role" "jenkins_role" {
  name = "sdlc-jenkins-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "jenkins_ecr" {
  role       = aws_iam_role.jenkins_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
}

resource "aws_iam_instance_profile" "jenkins_profile" {
  name = "sdlc-jenkins-instance-profile"
  role = aws_iam_role.jenkins_role.name
}

# --- Outputs ---

output "ecr_repository_url" {
  description = "The URL of the ECR repository"
  value       = aws_ecr_repository.sdlc_repo.repository_url
}
