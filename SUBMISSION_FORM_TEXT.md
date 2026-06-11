# Submission Form Text

Challenge: Engineer 004 - Senior Engineer

Artifact repository:
https://github.com/PAMF2/beat-claude-engineer-004

Primary written submission to attach:
submission_final.md

Reviewer note:
This submission includes a compact written answer plus a runnable engineering artifact repository. The repo contains validated Terraform for the AWS ingestion core, a dependency-free Node prototype, local tests, a capacity/cost model, a reconciliation simulation, an architecture diagram, a validation plan, an operational runbook, and an evidence log. All data is synthetic; no private customer data or credentials are included.

Local evidence commands:

```powershell
npm test
npm run capacity
npm run reconcile
npm run prototype
```

Terraform artifact validation:

```powershell
cd infra\terraform
terraform init -backend=false
terraform validate
```
