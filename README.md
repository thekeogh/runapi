# RunAPI

RunAPI is a local-only developer harness for calling TypeScript service internals without adding HTTP controllers.

Point it at a service root, choose a source file, export, method, and JSON arguments, then run the call in a fresh Node.js child process.

## Install

```bash
pnpm install
```

## Run

```bash
pnpm start
```

RunAPI starts at:

```text
http://localhost:7778
```

## Example

Service root:

```text
/Users/you/projects/my-api-service
```

Target file:

```text
src/integrations/cms/documents.ts
```

Export:

```text
documentsClient
```

Method:

```text
findById
```

Args:

```json
["document_123"]
```
