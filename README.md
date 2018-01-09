# cancel-circle-workflows

This is a proof-of-concept library for how simple it would be to implement functionality to cancel redundant workflows on CircleCI. Equivalent functionality existed within CircleCI 1.0 for redundant builds but that same functionality is now missing on CircleCI 2.0 with workflows.

### Setup
Install the package:
```bash
npm install --save-dev cancel-circle-workflows
```
```bash
yarn add -D cancel-circle-workflows
```

### Usage
This package has a default exported (promise-returning) function that expects to be invoked with a valid cookie string. This project assumes that it's being run on CircleCI directly. If you want to test this locally, just make sure to set the `CIRCLE_BRANCH`, `CIRCLE_PROJECT_USERNAME`, and `CIRCLE_PROJECT_REPONAME` environment variables beforehand.

Import this package:
```ts
import cancelCircleWorkflows from 'cancel-circle-workflows';
```

Call it while passing in your cookie:
```ts
await cancelCircleWorkflows(someValidCookie);
```
