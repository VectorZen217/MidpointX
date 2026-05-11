# Terraform configuration for MidpointX on GCP

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Cloud Run Service (The Engine)
resource "google_cloud_run_v2_service" "midpointx" {
  name     = "midpointx-gateway"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "gcr.io/${var.project_id}/midpointx:latest"
      
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "ENABLE_CLOUD_LOGGING"
        value = "true"
      }
      
      ports {
        container_port = 8080
      }
    }
  }
}

# 2. Firestore Database (State & Memory)
resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
}

# 3. Secret Manager (Credentials)
resource "google_secret_manager_secret" "anthropic_key" {
  secret_id = "ANTHROPIC_API_KEY"
  replication {
    auto {}
  }
}

variable "project_id" {
  type        = string
  description = "The GCP Project ID"
}

variable "region" {
  type        = string
  default     = "us-central1"
}

output "service_url" {
  value = google_cloud_run_v2_service.midpointx.uri
}
