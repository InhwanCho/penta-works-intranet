# Project workflow

- The user requests that changes to this project be deployed to production after implementation and successful validation. Deployment is part of the default task scope; do not ask for repeat approval unless the requested operation introduces a new destructive action outside that scope.
- Follow the existing main/Jenkins deployment workflow. Verify the deployed revision and service health, and report deployment failures or incomplete verification accurately.
- Commit only files belonging to the current task. Preserve unrelated local work.
