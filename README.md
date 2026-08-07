# T3 Code ForgeGraph plugin

ForgeGraph delivery tracking for T3 Code. The plugin uses the documented `fg`
CLI as an injectable boundary and exposes pull requests, checks, deployment
history, and overall delivery status for project and thread panels.

The first slice is read-only. It intentionally does not run deploy, merge,
rollback, or promotion commands.
