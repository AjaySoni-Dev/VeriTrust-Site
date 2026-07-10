# Security incident response

The incident commander owns containment, evidence preservation, user-impact assessment, notification escalation, recovery, and retrospective actions. Initial reports go to `security@veritrustlab.in`; secrets and personal content must not be sent in the first message.

For the API-key prefix incident: keep external API access disabled, preserve minimum access/audit evidence, revoke every pre-remediation key, review API usage and exports for anomalous access, notify affected owners through authenticated channels, rotate server peppers, and issue replacement keys only after the new storage contract passes tests.

