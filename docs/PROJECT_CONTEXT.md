# Project Context

This repository automates collection of support tickets from a Helpical tenant for configured hospital centers. The current milestone establishes typed configuration, domain models, tested Playwright page objects, and a collector. It deliberately stops before external task synchronization and durable SQLite synchronization.

The Helpical DOM contract was checked against the public Helpical deployment on September 7, 2026. Confirmed production anchors include `form#login-form`, username/password input names, `#talks`, `.talks-holder`, `.box-title`, `.message`, `.ticket-title`, and `#ticket-status-des`.
