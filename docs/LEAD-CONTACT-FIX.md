# Lead contact normalization

The human follow-up flow accepts natural contact input such as:

- `name@example.com`
- `+1 937 555 0100`
- `name@example.com, +1 937 555 0100`

When both an email address and a phone number are supplied in the same answer, the server normalizes the structured lead contact to the email address before invoking the existing lead-delivery gateway. This keeps browser input tolerant while preserving the gateway's strict validation and the existing business flow.

The normalizer does not store or log the discarded portion of a mixed contact string. Non-contact text is left for the existing gateway validation to reject.
