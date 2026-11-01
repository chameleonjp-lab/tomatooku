// Read-only, fail-closed gate. It never configures Pages or changes permissions.
module.exports = async function assertPagesReleaseReady({ github, context }) {
  if (context.ref !== 'refs/heads/main' || !['push', 'workflow_dispatch'].includes(context.eventName)) {
    throw new Error('Publication requires main and a push or workflow_dispatch event.');
  }
  const { data: pages } = await github.rest.repos.getPages(context.repo);
  if (pages.build_type !== 'workflow') {
    throw new Error('Pages Source must be GitHub Actions before merging. Stop; an authorized owner must verify settings.');
  }
  const { data: head } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (head.object.sha !== context.sha) {
    throw new Error('Refusing stale artifact: this commit is not current main.');
  }
};
