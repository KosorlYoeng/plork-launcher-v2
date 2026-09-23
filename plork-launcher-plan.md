# MzzPlork — Standalone Client & Launcher

## Master Implementation Instructions

You are the lead software architect and senior engineer responsible for building **MzzPlork**, a standalone game client ecosystem based on the existing CitizenFX/FiveM codebase available in this repository.

The goal is to create a complete MzzPlork platform consisting of:

1. MzzPlork Client
2. MzzPlork Launcher
3. MzzPlork Backend/API
4. MzzPlork Update/Manifest infrastructure
5. MzzPlork Game Server integration
6. Build/release pipeline
7. Testing and diagnostics

The final player experience should be:

```text
MzzPlork.exe
    ↓
Check launcher update
    ↓
Detect GTA V
    ↓
Authenticate
    ↓
Check MzzPlork client version
    ↓
Get manifest
    ↓
Compare local files
    ↓
Download missing/changed files
    ↓
Verify SHA-256
    ↓
Start MzzPlork Client
    ↓
Start/connect to GTA V
    ↓
Connect to MzzPlork RP Server
```

The launcher should provide a PPRP-style experience where the player does not need to manually manage the client installation or manually perform the normal FiveM launch workflow.

---

# 1. NON-NEGOTIABLE DEVELOPMENT RULES

Before changing ANY code:

1. Inspect the entire repository structure.
2. Identify the existing build system.
3. Identify the existing CitizenFX architecture.
4. Identify the existing client/server communication flow.
5. Identify the existing launcher code if present.
6. Identify existing update mechanisms.
7. Identify existing authentication mechanisms.
8. Identify existing configuration systems.
9. Identify existing tests.
10. Identify existing build scripts.

Do NOT guess.

Do NOT invent files/classes/functions that may already exist.

Do NOT duplicate existing functionality.

Do NOT rewrite working systems unnecessarily.

Reuse existing architecture whenever appropriate.

Before implementing a new subsystem, search the repository for an existing implementation or abstraction that can be extended.

Prefer existing patterns over introducing new patterns.

If a required capability does not exist, design the smallest clean abstraction necessary.

Avoid giant functions.

Avoid giant classes.

Avoid deeply nested if/else logic.

Use appropriate patterns such as:

* Strategy
* Factory
* Adapter
* Service
* Repository
* Dependency Injection

only when they genuinely improve the architecture.

Do not introduce design patterns merely for appearance.

---

# 2. IMPORTANT: UPSTREAM CITIZENFX

Treat the existing CitizenFX source as an upstream codebase.

Do not blindly rewrite or reorganize the CitizenFX repository.

Keep MzzPlork-specific functionality isolated as much as practical.

Maintain a clear separation between:

```text
UPSTREAM CITIZENFX
        +
MZZPLORK INTEGRATION
        +
MZZPLORK LAUNCHER
        +
MZZPLORK BACKEND
        +
MZZPLORK SERVER
```

The architecture must make future upstream synchronization possible.

Before modifying upstream code, document:

```text
File
Current responsibility
Why modification is required
MzzPlork functionality being added
Potential upstream merge impact
```

Do not remove upstream functionality unless there is a verified technical reason.

Do not modify licensing information or copyright notices.

Do not remove required attribution.

---

# 3. FIRST TASK — FULL REPOSITORY AUDIT

Before writing implementation code, inspect the repository.

Create:

```text
/docs/architecture/repository-audit.md
```

Document:

```text
Repository structure
Build system
Languages
Major projects
Client architecture
Server architecture
Networking
Resource system
Authentication
Configuration
Existing updater
Existing launcher
Build scripts
Testing
Dependencies
Potential extension points
Potential risks
```

Also identify:

```text
ENTRY POINTS
IMPORTANT MODULES
IMPORTANT CLASSES
IMPORTANT FUNCTIONS
BUILD COMMANDS
TEST COMMANDS
```

Do not implement major features until this audit is complete.

---

# 4. TARGET REPOSITORY ARCHITECTURE

Do not force the existing CitizenFX source into this exact structure if doing so would damage the upstream architecture.

Use this as the target logical architecture:

```text
mzzplork/
│
├── docs/
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── repository-audit.md
│   │   ├── launcher.md
│   │   ├── client.md
│   │   ├── backend.md
│   │   └── server.md
│   │
│   ├── protocol/
│   │   ├── authentication.md
│   │   ├── manifest.md
│   │   ├── update.md
│   │   └── connection.md
│   │
│   └── development/
│       ├── building.md
│       ├── debugging.md
│       └── release.md
│
├── launcher/
│
├── client/
│
├── backend/
│
├── server/
│
├── tools/
│
├── infrastructure/
│
└── tests/
```

If equivalent existing directories already exist, reuse them instead of creating duplicates.

---

# 5. MZZPLORK CLIENT

The MzzPlork client must be the actual game-side runtime.

Logical architecture:

```text
MzzPlork Client
│
├── Bootstrap
│
├── Authentication
│   ├── Session
│   ├── Token
│   └── Server identity
│
├── Update
│   ├── Version
│   ├── Manifest
│   ├── Download
│   └── Verification
│
├── Networking
│   ├── Connection
│   ├── Session
│   └── Server communication
│
├── Resource Runtime
│
├── Game Integration
│
├── Configuration
│
└── Diagnostics
    ├── Logging
    ├── Crash reporting
    └── Debug information
```

First identify equivalent CitizenFX systems.

Extend existing systems wherever possible.

Do not create a second networking/resource system if CitizenFX already provides the required infrastructure.

---

# 6. MZZPLORK LAUNCHER

The launcher should be a separate application.

If an existing Electron/Vue launcher exists in the workspace, inspect and reuse it.

Target logical architecture:

```text
launcher/
│
├── Electron Main
│   ├── UpdateManager
│   ├── GameDetector
│   ├── ClientManager
│   ├── ProcessManager
│   └── SecureStorage
│
├── Vue UI
│   ├── Splash
│   ├── Login
│   ├── Home
│   ├── Updating
│   ├── Settings
│   └── Error
│
└── API Client
```

Responsibilities:

### GameDetector

```text
Detect GTA V installation
Identify supported installation
Validate installation
Persist selected installation
```

Support the installation mechanisms that can be safely and reliably detected.

Do not hardcode a single path.

### UpdateManager

```text
Get launcher version
Get client manifest
Compare versions/files
Download files
Resume interrupted downloads
Verify SHA-256
Handle failed downloads
```

### ClientManager

```text
Install client
Validate client
Prepare client
Start client
```

### ProcessManager

```text
Start process
Monitor process
Handle exit
Capture failures
```

---

# 7. BACKEND/API

Create or extend the backend with a versioned API.

Target:

```text
/api/v1/
```

Endpoints:

```text
GET  /launcher/latest
GET  /client/latest
GET  /client/manifest
GET  /server/status

POST /auth/login
POST /auth/logout
POST /auth/refresh

POST /client/session
```

Use the existing backend stack if one already exists.

Do not introduce another backend framework unnecessarily.

---

# 8. DATABASE

Use the existing database technology if available.

The logical data model should support:

```text
users
sessions
client_versions
launcher_versions
manifest_versions
server_status
```

Potential structure:

```text
users
-----
id
username
email
password_hash
created_at
updated_at


client_versions
--------------
id
version
channel
build
published_at
manifest_id


launcher_versions
-----------------
id
version
channel
build
download_url
sha256
published_at
```

Never store plaintext passwords.

Never store private keys in the client.

Never expose database credentials to the launcher.

---

# 9. MANIFEST SYSTEM

Implement a deterministic manifest system.

Example:

```json
{
  "channel": "stable",
  "version": "0.1.0",
  "build": 100,
  "files": [
    {
      "path": "client/example.bin",
      "size": 123456,
      "sha256": "..."
    }
  ]
}
```

Create a manifest generator tool.

Logical workflow:

```text
Build
  ↓
Manifest Generator
  ↓
Calculate file sizes
  ↓
Calculate SHA-256
  ↓
Generate manifest
  ↓
Publish manifest
```

Launcher workflow:

```text
Download manifest
      ↓
Read local files
      ↓
Calculate SHA-256
      ↓
Compare
      ↓
Download only changed files
```

Do not redownload unchanged files.

---

# 10. DOWNLOAD SYSTEM

The downloader must support:

```text
HTTPS
Progress reporting
Parallel downloads where safe
Resume
Retry
Timeout
Integrity verification
Temporary files
Atomic replacement
```

Never overwrite a valid existing file with an incomplete download.

Use:

```text
file.tmp
```

then verify it before replacing the final file.

Handle:

```text
Network interruption
Server unavailable
Corrupt download
Insufficient disk space
Permission errors
```

---

# 11. UPDATE SYSTEM

Support separate versions:

```text
Launcher version
Client version
Manifest version
Server version
```

Example:

```text
Launcher: 1.0.5
Client:   0.1.3
Server:   0.1.3
```

Support channels:

```text
stable
beta
dev
```

Do not force beta/dev builds onto stable users.

---

# 12. AUTHENTICATION

Implement secure authentication.

Target:

```text
Launcher
   ↓
POST /auth/login
   ↓
API
   ↓
Validate credentials
   ↓
Create session
   ↓
Return short-lived access token
   ↓
Launcher
```

Implement refresh tokens securely.

Never embed:

```text
ADMIN_TOKEN
DATABASE_PASSWORD
PRIVATE_KEY
```

inside the launcher or client.

Server-side authorization must remain authoritative.

---

# 13. SERVER STATUS

The launcher should be able to display:

```text
ONLINE
OFFLINE
PLAYERS
MAX PLAYERS
VERSION
PING
```

Example API:

```json
{
  "online": true,
  "players": 128,
  "maxPlayers": 256,
  "version": "0.1.3"
}
```

Reuse existing server status mechanisms where available.

---

# 14. GAME LAUNCH FLOW

Implement the following lifecycle:

```text
MzzPlork.exe
     ↓
Bootstrap
     ↓
Check launcher update
     ↓
Initialize configuration
     ↓
Detect GTA V
     ↓
Authenticate
     ↓
Check client
     ↓
Get manifest
     ↓
Update client
     ↓
Verify client
     ↓
Create client session
     ↓
Start MzzPlork Client
     ↓
Client initializes
     ↓
Client validates session
     ↓
Connect to MzzPlork server
     ↓
Load resources
     ↓
Enter game
```

Every stage must have clear error handling.

---

# 15. CONFIGURATION

Create a proper configuration model.

Example:

```json
{
  "environment": "production",
  "apiBaseUrl": "https://api.example.com",
  "channel": "stable",
  "gamePath": "",
  "clientPath": "",
  "autoUpdate": true
}
```

Do not hardcode production URLs throughout the codebase.

Use environment/configuration abstractions.

---

# 16. LOGGING

Implement structured logging.

Separate:

```text
launcher.log
client.log
updater.log
backend.log
server.log
```

Include:

```text
timestamp
level
component
message
error
context
```

Do not log:

```text
passwords
access tokens
refresh tokens
private keys
```

---

# 17. CRASH/ERROR HANDLING

The launcher must provide useful errors.

Examples:

```text
GTA V not found
Client files corrupted
Update failed
Authentication failed
Server unavailable
Insufficient disk space
Permission denied
Client failed to start
```

Avoid generic:

```text
Something went wrong.
```

Provide actionable diagnostic information.

---

# 18. SECURITY

Implement:

```text
HTTPS
Secure authentication
Token expiration
Server-side authorization
Rate limiting
Manifest integrity
Signed launcher releases where appropriate
Secure update process
Input validation
Path traversal protection
```

Never trust paths received from a remote manifest without validation.

Prevent paths such as:

```text
../../something
```

from escaping the client directory.

---

# 19. WINDOWS SUPPORT

The primary target is:

```text
Windows 10/11 x64
```

Build and test the launcher and client on Windows.

Verify:

```text
Clean installation
No developer tools installed
No source repository present
No environment variables required
No hardcoded developer paths
```

The final user should only need the distributed launcher/client and the supported GTA V installation.

---

# 20. BUILD SYSTEM

Document exact commands for:

```text
Build client
Build launcher
Build backend
Build server resources
Run tests
Package release
Generate manifest
Publish release
```

Do not invent commands.

Inspect existing build scripts and use them.

If a build command is broken, diagnose the root cause before changing it.

---

# 21. CI/CD

Create a pipeline that can eventually perform:

```text
Commit
 ↓
Build
 ↓
Unit tests
 ↓
Integration tests
 ↓
Package
 ↓
Generate hashes
 ↓
Generate manifest
 ↓
Publish artifacts
```

Separate:

```text
development
beta
production
```

Do not automatically publish production releases from arbitrary development commits.

---

# 22. TESTING

Create tests for:

### Launcher

```text
Game detection
Configuration
Authentication
Manifest parsing
Hash verification
Download
Resume
Retry
Update
Process launch
```

### Backend

```text
Authentication
Authorization
Manifest API
Version API
Server status
Invalid input
Expired session
```

### Client

```text
Bootstrap
Authentication
Connection
Resource initialization
Configuration
Error handling
```

### Integration

Test:

```text
Fresh installation
Existing installation
Outdated client
Corrupt client
Interrupted download
Offline server
Invalid authentication
Launcher update
Client update
```

---

# 23. DEVELOPMENT PHASES

Implement in this exact order unless repository constraints require a documented change.

## Phase 0

Repository audit.

Deliver:

```text
docs/architecture/repository-audit.md
```

No major implementation yet.

---

## Phase 1

Build existing CitizenFX source.

Goal:

```text
Clean build
      ↓
Development client
      ↓
Development server
      ↓
Successful connection
```

Do not customize branding yet.

---

## Phase 2

Create MzzPlork client integration layer.

Goal:

```text
MzzPlork Client
      ↓
Authentication
      ↓
Development server
      ↓
Gameplay
```

---

## Phase 3

Build backend.

Implement:

```text
Authentication
Versions
Manifest
Server status
Sessions
```

---

## Phase 4

Build manifest/update infrastructure.

Implement:

```text
Manifest generator
Hash generator
File storage
Downloader
Verification
Resume
Retry
```

---

## Phase 5

Integrate the launcher.

Implement:

```text
Login
GTA detection
Manifest
Download
Verification
Client management
Play
```

---

## Phase 6

Implement game/client launch integration.

Goal:

```text
MzzPlork.exe
      ↓
MzzPlork Client
      ↓
GTA V
      ↓
MzzPlork Server
```

---

## Phase 7

Production security.

Implement:

```text
HTTPS
Secure tokens
Rate limiting
Signed releases
Manifest security
Path validation
Logging
```

---

## Phase 8

Testing.

Use a clean Windows machine.

Test the complete player experience.

---

## Phase 9

Release pipeline.

Implement:

```text
Build
Test
Package
Sign
Hash
Manifest
Upload
Publish
```

---

# 24. DOCUMENTATION REQUIREMENTS

Maintain:

```text
/docs/architecture/
/docs/protocol/
/docs/development/
```

Every major architectural decision must be documented.

Create:

```text
docs/architecture/decisions.md
```

For each decision:

```text
Decision
Context
Options
Chosen approach
Reason
Consequences
```

---

# 25. TASK TRACKING

Create:

```text
/docs/plan.md
```

Break the project into small tasks.

Each task must contain:

```text
ID
Title
Description
Files/components
Dependencies
Implementation status
Testing requirements
```

Use:

```text
TODO
IN_PROGRESS
BLOCKED
DONE
```

Do not mark a task DONE without testing it.

---

# 26. WORKING METHOD

For every task:

```text
1. Inspect
2. Understand
3. Plan
4. Implement
5. Build
6. Test
7. Review
8. Document
9. Mark complete
```

Before modifying an existing file:

```text
Read the file.
Understand its responsibility.
Search for callers.
Search for related implementations.
Then modify it.
```

After modification:

```text
Build affected component.
Run relevant tests.
Check for regressions.
```

---

# 27. DO NOT DO THESE THINGS

Do NOT:

```text
Rewrite CitizenFX from scratch.
Copy existing code into duplicate modules.
Create duplicate networking systems.
Create duplicate resource systems.
Hardcode GTA paths.
Hardcode production credentials.
Put secrets in the launcher.
Download everything on every launch.
Trust remote file paths blindly.
Skip integrity verification.
Ignore build failures.
Hide errors.
Delete upstream licensing/attribution.
Make large unrelated refactors.
```

---

# 28. FIRST EXECUTION

Start NOW.

Your first response/action should NOT be a large code rewrite.

Perform:

```text
1. Repository audit
2. Identify current architecture
3. Identify build system
4. Identify client entry point
5. Identify server entry point
6. Identify networking
7. Identify resource system
8. Identify launcher
9. Identify existing updater
10. Identify test/build commands
```

Then create:

```text
/docs/architecture/repository-audit.md
/docs/plan.md
```

After that, report:

```text
CURRENT STATE
- What already exists
- What works
- What is missing
- What can be reused
- What must be implemented

ARCHITECTURE
- Current architecture
- Target architecture
- Integration points

RISKS
- Build risks
- Upstream synchronization risks
- Runtime risks
- Update risks
- Security risks

PHASE 1
- Exact tasks
- Exact files
- Exact commands
- Expected result
```

Do NOT proceed into a large implementation until the repository audit has been completed.

Once the audit is complete, implement the project incrementally according to `/docs/plan.md`.

After every meaningful change, build and test the affected component.

The final objective is:

```text
MzzPlork.exe
      ↓
Automatic update
      ↓
GTA V detection
      ↓
Authentication
      ↓
MzzPlork client update
      ↓
Integrity verification
      ↓
MzzPlork Client
      ↓
GTA V
      ↓
MzzPlork RP Server
```

The result must be maintainable, testable, updateable, and structured so that future upstream CitizenFX synchronization does not require rebuilding the entire project from scratch.
