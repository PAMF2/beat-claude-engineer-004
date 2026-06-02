# Engineer 004 Submission Packet

This folder contains a draft submission package for the Beat Claude Engineer 004 challenge.

Files:

- `ARTIFACT_ACCESS.md`: reviewer instructions and no-login evidence commands.
- `submission_final.md`: final aligned written answer, organized to match the Engineer 004 prompt.
- `infra/terraform/`: production-shaped Terraform for the AWS ingestion core.
- `artifact/operational_runbook.md`: rollout, incident, rollback, and deletion runbook.
- `artifact/capacity_model.js`: executable capacity and cost model for the streaming core.
- `artifact/reconciliation_sim.js`: executable synthetic reconciliation check for dedupe, late events, DLQ, and segment counting.
- `artifact/architecture.mmd`: standalone Mermaid architecture diagram.
- `artifact/adr-001-streaming-core.md`: architecture decision record for the streaming core.
- `artifact/evidence_log.md`: command/result evidence log for local validation.
- `artifact/validation_plan.md`: operating validation plan for migration and rollout.
- `prototype/`: dependency-free Node prototype for ingest, processing, segment state, and reconciliation.

How to run the artifact:

```powershell
node artifact\capacity_model.js
node artifact\reconciliation_sim.js
npm test
npm run prototype
```

The model uses explicit assumptions so reviewers can change the event size, spike factor, shard headroom, and pricing constants.

Terraform is included as an artifact. Run `terraform init` and `terraform plan` from `infra/terraform/` only after configuring AWS credentials and replacing `raw_bucket_name` in `example.tfvars`.

Validated locally with Terraform `1.15.5`:

```powershell
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```
