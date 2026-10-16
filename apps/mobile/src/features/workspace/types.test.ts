import { WORKSPACE_VIEWS, isWorkspaceView } from '@/features/workspace/types';

describe('workspace views', () => {
  it('excludes the CAD projects view on mobile', () => {
    expect(WORKSPACE_VIEWS).not.toContain('projects');
  });

  it('recognizes valid views and rejects unknown ones', () => {
    expect(isWorkspaceView('dashboard')).toBe(true);
    expect(isWorkspaceView('nope')).toBe(false);
  });
});
