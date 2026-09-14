# Local use and private data

Taskverse currently runs as a single-user application on your own computer. Use the documented launch command, which binds the server to `127.0.0.1`. The API has no account authentication; do not expose your personal instance through a public tunnel or reverse proxy.

Project data, conversations, API keys, search credentials, cookies and backups belong in the ignored `.local/` directory or local environment files. Never add these to Git, screenshots, issues or pull requests. Share only synthetic demonstration data. The model provider receives the project and conversation context sent for a request; model use requires your own credentials and may incur fees.

Screenshot and browser-test scripts use synthetic API responses and block unhandled API traffic. Run browser checks against a separate development instance. Unit tests use temporary storage. Historical browser scripts that edited the live personal project are not included in this release snapshot.

For a future public demo, use an isolated demonstration database and add authentication, access control and AI request limits first.
