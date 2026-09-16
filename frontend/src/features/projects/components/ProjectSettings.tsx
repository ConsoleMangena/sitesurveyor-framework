import React from 'react';
import { Loader2 } from "lucide-react";
import type { HubProject } from '../../../pages/shared/ProjectHubPage.tsx';
import type { CrsType } from '../../../lib/mappers.ts';
import type { ProjectActivity } from '../../../lib/repositories/projects.ts';
import type { OrganizationRow } from '../../../lib/repositories/organizations.ts';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SelectDropdown from '../../../components/SelectDropdown.tsx';

interface ProjectSettingsProps {
  activeProject: HubProject;
  editName: string;
  setEditName: (v: string) => void;
  editClient: string;
  organizations: OrganizationRow[];
  editOrgId: string;
  setEditOrgId: (v: string) => void;
  editPhase: string;
  setEditPhase: (v: string) => void;
  editDatum: string;
  setEditDatum: (v: string) => void;
  editAxisConvention: 'yx' | 'xy';
  setEditAxisConvention: (v: 'yx' | 'xy') => void;
  editCrsType: CrsType;
  setEditCrsType: (v: CrsType) => void;
  editCrsEpsg: string;
  setEditCrsEpsg: (v: string) => void;
  editLocalOriginE: string;
  setEditLocalOriginE: (v: string) => void;
  editLocalOriginN: string;
  setEditLocalOriginN: (v: string) => void;
  editBearingFormat: string;
  setEditBearingFormat: (v: string) => void;
  editAngleEntry: string;
  setEditAngleEntry: (v: string) => void;
  editCoordDecimals: string;
  setEditCoordDecimals: (v: string) => void;
  editStatus: string;
  setEditStatus: (v: string) => void;
  editDesc: string;
  setEditDesc: (v: string) => void;
  handleUpdateProject: () => Promise<void>;
  saving: boolean;
  canEditProjects: boolean;
  canInviteProjectMembers: boolean;
  handleUnarchiveProject: (dbId: string) => Promise<void>;
  setSelectedProject: (p: HubProject) => void;
  setShowPermanentDeleteConfirm: (v: boolean) => void;
  setShowDeleteConfirm: (v: boolean) => void;
  setShowAssignModal: (v: boolean) => void;

  activities: ProjectActivity[];
  settingsActivitySections: ProjectActivity[][];
  settingsActivitySectionIndex: number;
  setSettingsActivitySectionIndex: React.Dispatch<React.SetStateAction<number>>;
  newActivityText: string;
  setNewActivityText: (v: string) => void;
  submittingActivity: boolean;
  deletingActivityId: string | null;
  handleAddActivity: (e: React.FormEvent) => Promise<void>;
  handleDeleteActivity: (id: string) => Promise<void>;
}

export function ProjectSettings({
  activeProject,
  editName,
  setEditName,
  editClient,
  organizations,
  editOrgId,
  setEditOrgId,
  editPhase,
  setEditPhase,
  editDatum,
  setEditDatum,
  editAxisConvention,
  setEditAxisConvention,
  editCrsType,
  setEditCrsType,
  editCrsEpsg,
  setEditCrsEpsg,
  editLocalOriginE,
  setEditLocalOriginE,
  editLocalOriginN,
  setEditLocalOriginN,
  editBearingFormat,
  setEditBearingFormat,
  editAngleEntry,
  setEditAngleEntry,
  editCoordDecimals,
  setEditCoordDecimals,
  editStatus,
  setEditStatus,
  editDesc,
  setEditDesc,
  handleUpdateProject,
  saving,
  canEditProjects,
  canInviteProjectMembers,
  handleUnarchiveProject,
  setSelectedProject,
  setShowPermanentDeleteConfirm,
  setShowDeleteConfirm,
  setShowAssignModal,
  activities,
  settingsActivitySections,
  settingsActivitySectionIndex,
  setSettingsActivitySectionIndex,
  newActivityText,
  setNewActivityText,
  submittingActivity,
  deletingActivityId,
  handleAddActivity,
  handleDeleteActivity,
}: ProjectSettingsProps) {
  return (
    <div className="project-settings-container responsive-grid-sidebar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="card project-workspace-card" style={{ padding: '24px' }}>
          <div className="project-settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-h)', margin: 0 }}>Project Information</h2>
            <button className="btn btn-primary btn-sm" onClick={handleUpdateProject} disabled={saving || !canEditProjects}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Project Name</label>
            <input type="text" className="input-field" value={editName} onChange={e => setEditName(e.target.value)} />
          </div>

          <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Client / Organization</label>
              <SelectDropdown
                className="input-field"
                value={editOrgId}
                onChange={setEditOrgId}
                disabled={!canEditProjects}
                options={[
                  { value: '', label: editClient || 'Unassigned' },
                  ...organizations.map(org => ({ value: org.id, label: org.name })),
                ]}
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Phase</label>
              <select className="input-field" value={editPhase} onChange={e => setEditPhase(e.target.value)}>
                <option>Planning</option>
                <option>Field Execution</option>
                <option>Data Processing</option>
                <option>Drafting</option>
                <option>Quality Assurance</option>
                <option>Delivered</option>
              </select>
            </div>
          </div>

          <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Status</label>
              <select className="input-field" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                <option>Draft</option>
                <option>Active</option>
                <option>On Hold</option>
                <option>Completed</option>
                <option>Archived</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Axis Convention</label>
              <select className="input-field" value={editAxisConvention} onChange={e => setEditAxisConvention(e.target.value as 'yx' | 'xy')}>
                <option value="yx">Y, X (Zimbabwe / RSA Gauss — Y = Easting first)</option>
                <option value="xy">X, Y (UTM / International — X = Easting first)</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">Controls coordinate readouts in CAD and every COGO & Computation tool.</p>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Coordinate System Type</label>
            <select className="input-field" value={editCrsType} onChange={e => setEditCrsType(e.target.value as CrsType)}>
              <option value="local">Local site grid (arbitrary project origin)</option>
              <option value="projected">Projected CRS (UTM, SPCS, Gauss-Conform, ...)</option>
              <option value="other">Other / unspecified</option>
            </select>
          </div>

          {editCrsType === 'projected' && (
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>EPSG Code (optional)</label>
              <input type="text" className="input-field" value={editCrsEpsg} onChange={e => setEditCrsEpsg(e.target.value)} placeholder="e.g. 32736" />
            </div>
          )}

          {editCrsType === 'local' && (
            <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Local Origin Easting</label>
                <input type="text" className="input-field" value={editLocalOriginE} onChange={e => setEditLocalOriginE(e.target.value)} placeholder="Value treated as 0 in local grid" />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Local Origin Northing</label>
                <input type="text" className="input-field" value={editLocalOriginN} onChange={e => setEditLocalOriginN(e.target.value)} placeholder="Value treated as 0 in local grid" />
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Datum Name</label>
            <input type="text" className="input-field" value={editDatum} onChange={e => setEditDatum(e.target.value)} placeholder="e.g. WGS84, Arc 1950, site local..." />
            <p className="text-xs text-muted-foreground mt-1">A short human-readable datum label. Use the fields above for the technical CRS / EPSG code.</p>
          </div>

          <div className="responsive-grid-3" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Bearing Format</label>
              <select className="input-field" value={editBearingFormat} onChange={e => setEditBearingFormat(e.target.value)}>
                <option value="azimuth">WCB / Forward Bearing (D°M'S")</option>
                <option value="quadrant">Reduced Bearing (N/S .. E/W)</option>
                <option value="gon">Gon / Grad</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Angle Entry</label>
              <select className="input-field" value={editAngleEntry} onChange={e => setEditAngleEntry(e.target.value)}>
                <option value="packed">Packed DD.MMSS</option>
                <option value="dms">D M S fields</option>
                <option value="decimal">Decimal degrees</option>
                <option value="gon">Gon / Grad</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Coordinate Decimals</label>
              <input type="number" className="input-field" min="0" max="6" value={editCoordDecimals} onChange={e => setEditCoordDecimals(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Description / Scope of Work</label>
            <textarea className="input-field" style={{ minHeight: '100px' }} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
          </div>
        </div>

        <div className="card project-workspace-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-h)', margin: 0, marginBottom: '16px' }}>Danger Zone</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeProject.status === 'Archived' ? (
              <>
                <div className="project-settings-danger-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid var(--color-success-border)', background: 'var(--color-success-bg)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-success)' }}>Restore Project</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-success)' }}>Make project active and editable again.</span>
                  </div>
                <button className="btn btn-sm" style={{ background: 'var(--color-success)', color: '#fff', border: 'none' }} onClick={() => handleUnarchiveProject(activeProject.dbId)} disabled={!canEditProjects}>Restore</button>
                </div>
                <div className="project-settings-danger-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid var(--color-error-border)', background: 'var(--color-error-bg)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-error)' }}>Permanent Delete</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-error)' }}>Destroy all project data. This cannot be undone.</span>
                  </div>
                  <button className="btn btn-sm" style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }} onClick={() => { setSelectedProject(activeProject); setShowPermanentDeleteConfirm(true); }} disabled={!canEditProjects}>Delete</button>
                </div>
              </>
            ) : (
              <div className="project-settings-danger-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid var(--color-error-border)', background: 'var(--color-error-bg)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-error)' }}>Archive Project</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-error)' }}>Mark project as inactive and read-only.</span>
                </div>
                <button className="btn btn-sm" style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }} onClick={() => { setSelectedProject(activeProject); setShowDeleteConfirm(true); }} disabled={!canEditProjects}>Archive</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="card project-workspace-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-h)', margin: 0, marginBottom: '20px' }}>Team Members</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeProject.members.map((member, idx) => (
              <div key={idx} className="project-settings-member-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-h)' }}>{member.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{member.role}</span>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: member.status === 'active' ? 'var(--color-success)' : 'var(--color-warning)' }}>{member.status}</span>
              </div>
            ))}
            <button className="btn btn-outline btn-sm" style={{ marginTop: '8px' }} onClick={() => setShowAssignModal(true)} disabled={!canInviteProjectMembers}>Assign Member</button>
          </div>
        </div>

        <div className="card project-workspace-card" style={{ padding: '24px' }}>
          <h3 className="project-dashboard-card-title" style={{ margin: 0, marginBottom: '16px' }}>Project Activity Log</h3>
          <div className="project-dashboard-timeline" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <form onSubmit={handleAddActivity} className="flex flex-col sm:flex-row gap-2 mb-4">
              <Input
                placeholder="Add a log entry..."
                value={newActivityText}
                onChange={(e) => setNewActivityText(e.target.value)}
                className="h-9 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                disabled={submittingActivity || !newActivityText.trim()}
                className="shrink-0"
              >
                {submittingActivity ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                Log
              </Button>
            </form>
            {activities.length > 0 && settingsActivitySections[settingsActivitySectionIndex] ? (
              <>
                <section style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span className="badge badge-blue">Section {settingsActivitySectionIndex + 1}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {settingsActivitySections[settingsActivitySectionIndex].length} items
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {settingsActivitySectionIndex + 1} / {settingsActivitySections.length}
                  </span>
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {settingsActivitySections[settingsActivitySectionIndex].map(log => (
                    <div key={log.id} className="project-dashboard-timeline-item" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span className="project-dashboard-timeline-dot" style={{ background: log.activity_type === 'system' ? '#3b82f6' : '#6366f1' }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-h)' }}>{log.content}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{log.user_name} &bull; {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteActivity(log.id)}
                        disabled={deletingActivityId === log.id}
                        className="h-7 px-2 text-xs"
                      >
                        {deletingActivityId === log.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          'Delete'
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
                </section>
                <div className="flex justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSettingsActivitySectionIndex((prev) => Math.max(0, prev - 1))}
                    disabled={settingsActivitySectionIndex <= 0}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSettingsActivitySectionIndex((prev) => Math.min(settingsActivitySections.length - 1, prev + 1))}
                    disabled={settingsActivitySectionIndex >= settingsActivitySections.length - 1}
                  >
                    Next
                  </Button>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>No activity logged yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
