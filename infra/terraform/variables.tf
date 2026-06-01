variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "staging"
}

variable "name_prefix" {
  description = "Resource name prefix."
  type        = string
  default     = "sg-rt-analytics"
}

variable "raw_bucket_name" {
  description = "Globally unique S3 bucket name for raw events."
  type        = string
}

variable "kinesis_shard_count" {
  description = "Provisioned Kinesis shard count. Capacity model starts with 24 for 50M events/day and 10x spike headroom."
  type        = number
  default     = 24
}

variable "kinesis_retention_hours" {
  description = "Kinesis retention period for replay and incident recovery."
  type        = number
  default     = 72
}

variable "raw_standard_retention_days" {
  description = "Days to keep raw events in S3 Standard before tiering."
  type        = number
  default     = 90
}

variable "raw_expiration_days" {
  description = "Days before raw events expire unless retained by policy."
  type        = number
  default     = 730
}

variable "alarm_actions" {
  description = "SNS topic ARNs or action ARNs for CloudWatch alarms."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Additional common tags."
  type        = map(string)
  default     = {}
}
