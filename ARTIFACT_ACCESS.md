# Artifact Access

No login or private data is required. All artifacts use public AWS documentation and synthetic data.

## Review Order

1. Read `submission_final.md`.
2. Open `artifact/architecture.mmd`.
3. Review `artifact/evidence_log.md`.
4. Inspect `infra/terraform/`.
5. Run the local evidence commands below.
6. Review `artifact/validation_plan.md` and `artifact/operational_runbook.md`.

## Local Evidence Commands

Prerequisites:

- Node.js with npm.
- Terraform CLI for IaC validation.

From the repository root:

```powershell
npm test
npm run capacity
npm run reconcile
npm run prototype
```

From `infra/terraform/`:

```powershell
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

No AWS credentials are required for the commands above. The Terraform configuration has been validated statically but intentionally not deployed.
