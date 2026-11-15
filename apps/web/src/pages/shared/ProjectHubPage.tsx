import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus,
  ArrowLeft,
  LayoutGrid,
  Settings,
  ChevronLeft,
  ChevronRight,
  Layers,
  Activity,
  CheckCircle2,
  Archive,
  User,
  FolderOpen,
  CloudOff,
  Loader2,
  RefreshCw,
  PanelRightOpen,
  Search,
  X,
  MapPin,
  Satellite,
  ClipboardList,
} from 'lucide-react'

import ErrorNotice from '@/components/errors/ErrorNotice.tsx'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { ComboboxField } from '@/components/templates/ComboboxField.tsx'
import {
  RegisterWorkspace,
  RegisterPanel,
  FilterGroup,
  FilterRow,
  InspectorPanel,
  InspectorSection,
  KeyValues,
  RegisterStatus,
  RailCollapseButton,
} from '@/components/workbench/RegisterWorkspace.tsx'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { generateLocalId } from '@/lib/localDb/utils'
import { DashboardShell, DashboardHeader } from '@/components/dashboard/DashboardShell.tsx'
import { KpiCard, KpiGrid } from '@/components/dashboard/KpiCard.tsx'
import { PageForm } from '@/components/templates/PageForm.tsx'

import {
  createProject,
  updateProject,
  archiveProject,
  unarchiveProject,
  deleteProject,
  listProjectMembersForProjects,
  listProjectActivities,
  createProjectActivity,
  deleteProjectActivity,
  type ProjectActivity,
  type ProjectMemberWithProfile,
  type ProjectUpdate,
} from '../../lib/repositories/projects.ts'
import { useProjects } from '../../lib/hooks/useProjects.ts'
import { listAssets, updateAsset, type AssetRow } from '../../lib/repositories/assets.ts'
import PageLoader from '../../components/PageLoader.tsx'
import { listOrganizations, createOrganization } from '../../lib/repositories/organizations.ts'
import type { OrganizationRow } from '../../lib/repositories/organizations.ts'
import { mapProjectRowToHubProject, type CrsType, type UiHubProject } from '../../lib/mappers.ts'
import { getMyWorkspaceMembership } from '../../lib/repositories/workspaces.ts'
import { canManageProjects, canManageTeam } from '../../lib/permissions.ts'
import { ProjectDashboard } from '../../features/projects/components/ProjectDashboard.tsx'
import { ProjectSettings } from '../../features/projects/components/ProjectSettings.tsx'
import { ProjectEarthObservationPanel } from '../../features/projects/components/ProjectEarthObservationPanel.tsx'
import { useAsyncAction } from '../../hooks/useAsyncAction.ts'
import { useOfflineSyncStatus } from '../../lib/hooks/useOfflineSyncStatus.ts'
import {
  readCachedActivities,
  writeCachedActivities,
  readActivityQueue,
  writeActivityQueue,
  clearActivityQueue,
  mergeActivities,
  buildPendingActivity,
  queueActivityCreate,
  queueActivityDelete,
  type ActivityWithMeta,
} from '../../lib/activityCache.ts'

export type HubProject = UiHubProject

interface ProjectHubPageProps {
  userName: string
  workspaceId: string
  onNavigate?: (view: string, context?: Record<string, string>) => void
}

type ProjectTab = 'overview' | 'earthObservation' | 'settings'

const VALID_TABS: ProjectTab[] = ['overview', 'earthObservation', 'settings']

function isValidProjectTab(value: string | null): value is ProjectTab {
  return VALID_TABS.includes(value as ProjectTab)
}

const statusBadgeVariant: Record<string, BadgeProps['variant']> = {
  Active: 'success',
  Completed: 'default',
  'On Hold': 'warning',
  Draft: 'secondary',
  Archived: 'secondary',
}

const tabIcons: Record<ProjectTab, React.ReactNode> = {
  overview: <LayoutGrid className="h-4 w-4" />,
  earthObservation: <Satellite className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
}

const tabLabels: Record<ProjectTab, string> = {
  overview: 'Overview',
  earthObservation: 'Earth Observation',
  settings: 'Settings',
}

type ProjectFilter = 'All' | 'Active' | 'Completed' | 'Mine' | 'Archived'

const kpiIcons: Record<ProjectFilter, React.ReactNode> = {
  All: <Layers className="size-4" />,
  Active: <Activity className="size-4" />,
  Completed: <CheckCircle2 className="size-4" />,
  Mine: <User className="size-4" />,
  Archived: <Archive className="size-4" />,
}

const kpiTones: Record<ProjectFilter, 'primary' | 'success' | 'purple' | 'neutral'> = {
  All: 'primary',
  Active: 'primary',
  Completed: 'success',
  Mine: 'purple',
  Archived: 'neutral',
}

export default function ProjectHubPage({ userName, workspaceId, onNavigate }: ProjectHubPageProps) {
  const { projects: projectRows, loading: projectsLoading, error: projectsError, refresh: refreshProjectRows } = useProjects(workspaceId)
  const [projectSnapshot, setProjectSnapshot] = useState<{
    workspaceId: string
    source: typeof projectRows
    projects: HubProject[]
  } | null>(null)
  const projects = useMemo(
    () => projectSnapshot?.workspaceId === workspaceId ? projectSnapshot.projects : [],
    [projectSnapshot, workspaceId],
  )
  const resolvingProjects = projectsLoading || projectSnapshot?.workspaceId !== workspaceId || projectSnapshot?.source !== projectRows
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'info'; message: string } | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignEmail, setAssignEmail] = useState('')
  const [assigningMember, setAssigningMember] = useState(false)
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'ops_manager' | 'finance' | 'sales' | 'technician' | 'viewer' | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeProjectId = searchParams.get('projectId')
  const routeTab = searchParams.get('tab')
  const activeProjectTab: ProjectTab = isValidProjectTab(routeTab) ? routeTab : 'overview'
  const setProjectRoute = (projectId: string | null, tab: ProjectTab = 'overview') => {
    setSearchParams(projectId ? { view: 'projects', projectId, tab } : { view: 'projects' })
  }
  const setActiveProjectTab = (tab: ProjectTab) => setProjectRoute(activeProjectId, tab)
  const [deployedAssets, setDeployedAssets] = useState<AssetRow[]>([])

  // Only resolve project routes against rows belonging to the current workspace.
  const activeProject = activeProjectId && projectRows.some(row => row.id === activeProjectId && row.workspace_id === workspaceId)
    ? projects.find(project => project.dbId === activeProjectId) ?? null
    : null
  const resolvedProjectId = activeProject?.dbId

  const syncStatus = useOfflineSyncStatus()
  const prevSyncStatusRef = useRef(syncStatus.status)

  const [editName, setEditName] = useState('')
  const [editClient, setEditClient] = useState('')
  const [editOrgId, setEditOrgId] = useState('')
  const [editPhase, setEditPhase] = useState('')
  const [editDatum, setEditDatum] = useState('')
  const [editAxisConvention, setEditAxisConvention] = useState<'yx' | 'xy'>('yx')
  const [editCrsType, setEditCrsType] = useState<CrsType>('local')
  const [editCrsEpsg, setEditCrsEpsg] = useState('')
  const [editLocalOriginE, setEditLocalOriginE] = useState('0')
  const [editLocalOriginN, setEditLocalOriginN] = useState('0')
  const [editBearingFormat, setEditBearingFormat] = useState('azimuth')
  const [editAngleEntry, setEditAngleEntry] = useState('packed')
  const [editCoordDecimals, setEditCoordDecimals] = useState('3')
  const [editStatus, setEditStatus] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const [activities, setActivities] = useState<ActivityWithMeta[]>([])
  const [newActivityText, setNewActivityText] = useState('')
  const [submittingActivity, setSubmittingActivity] = useState(false)
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null)
  const [overviewActivitySectionIndex, setOverviewActivitySectionIndex] = useState(0)
  const [settingsActivitySectionIndex, setSettingsActivitySectionIndex] = useState(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<ProjectFilter>('All')
  const [railCollapsed, setRailCollapsed] = useState(false)
  const selectedProject = projects.find(project => project.dbId === selectedProjectId) ?? null

  const [newName, setNewName] = useState('')
  const [newOrgId, setNewOrgId] = useState('')
  const [newOrgName, setNewOrgName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPhase, setNewPhase] = useState('Planning')
  const [newDatum, setNewDatum] = useState('WGS84 / UTM 36S')
  const [customDatum, setCustomDatum] = useState('')
  const [saving, setSaving] = useState(false)

  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false)
  const [projectMobileMenuOpen, setProjectMobileMenuOpen] = useState(false)

  const projectTabs = useMemo<ProjectTab[]>(() => VALID_TABS, [])

  useEffect(() => {
    let cancelled = false
    if (!resolvedProjectId) return
    const activeProjectName = projects.find(p => p.dbId === resolvedProjectId)?.name
    listAssets(workspaceId).then((allAssets) => {
      if (cancelled) return
      const projAssets = allAssets.filter(a => {
        const meta = a.metadata as Record<string, unknown>
        return meta?.current_project_name === activeProjectName && a.status === 'deployed'
      })
      setDeployedAssets(projAssets)
    }).catch(() => { if (!cancelled) setDeployedAssets([]) })
    return () => { cancelled = true }
  }, [resolvedProjectId, projects, workspaceId])

  // Keep the HubProject list in sync with the local-first projectRows.
  // Members are resolved in two bulk queries total — never one fetch per
  // project row (which multiplied with every 15 s silent poll).
  useEffect(() => {
    let cancelled = false
    const map = async () => {
      const workspaceRows = projectRows.filter(row => row.workspace_id === workspaceId)
      let membersByProject = new Map<string, ProjectMemberWithProfile[]>()
      try {
        membersByProject = await listProjectMembersForProjects(
          workspaceRows.map((row) => row.id),
        )
      } catch {
        // Member resolution is best-effort; rows still render without names.
      }
      if (cancelled) return
      const mapped = workspaceRows.map((row) =>
        mapProjectRowToHubProject(
          row,
          (membersByProject.get(row.id) ?? []).map((m) => ({
            full_name: m.full_name,
            email: m.email,
            role: m.role,
          })),
        ),
      )
      setProjectSnapshot({ workspaceId, source: projectRows, projects: mapped })
    }
    void map()
    return () => { cancelled = true }
  }, [projectRows, workspaceId])

  const fetchProjects = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) {
        setLoading(true)
      }
      setError(null)
      await refreshProjectRows()
      const orgs = await listOrganizations(workspaceId)
      setOrganizations(orgs)

      const membership = await getMyWorkspaceMembership(workspaceId)
      setMyRole((membership?.role ?? null) as typeof myRole)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects.')
    } finally {
      if (!opts?.silent) {
        setLoading(false)
      }
    }
  }, [workspaceId, refreshProjectRows])

  useAsyncAction(fetchProjects, [fetchProjects])

  // Re-fetch the project list when the offline-first sync completes (or errors)
  // so the UI reflects server rows without requiring a manual reload.
  useEffect(() => {
    if (
      prevSyncStatusRef.current !== syncStatus.status &&
      (syncStatus.status === 'synced' || syncStatus.status === 'error')
    ) {
      void fetchProjects({ silent: true })
    }
    prevSyncStatusRef.current = syncStatus.status
  }, [syncStatus.status, fetchProjects])

  // Periodic refresh while the page is visible, in case sync ran before this
  // component mounted or the status stream was missed.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void fetchProjects({ silent: true })
    }, 15000)
    return () => clearInterval(id)
  }, [fetchProjects])

  const effectiveProjectTab = useMemo<ProjectTab>(
    () => (projectTabs.includes(activeProjectTab) ? activeProjectTab : 'overview'),
    [projectTabs, activeProjectTab],
  )

  const filteredProjects = projects.filter((p) => {
    if (activeFilter === 'Active' && p.status !== 'Active') return false
    if (activeFilter === 'Completed' && p.status !== 'Completed') return false
    if (activeFilter === 'Archived' && p.status !== 'Archived') return false
    if (activeFilter === 'Mine' && (!p.members.some((m) => m.name === userName) || p.status === 'Archived')) return false
    if (activeFilter === 'All' && p.status === 'Archived') return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const searchable = [p.name, p.client, p.id, p.datum, p.phase].join(' ').toLowerCase()
      if (!searchable.includes(q)) return false
    }
    return true
  })

  const counts = {
    All: projects.filter(p => p.status !== 'Archived').length,
    Active: projects.filter(p => p.status === 'Active').length,
    Completed: projects.filter(p => p.status === 'Completed').length,
    Mine: projects.filter(p => p.status !== 'Archived' && p.members.some((m) => m.name === userName)).length,
    Archived: projects.filter(p => p.status === 'Archived').length,
  }

  const canEditProjects = canManageProjects(myRole)
  const canInviteProjectMembers = canManageTeam(myRole)

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      let organizationId: string | null = newOrgId || null
      if (!organizationId && newOrgName.trim()) {
        const org = await createOrganization(workspaceId, { name: newOrgName.trim(), organization_type: 'client' })
        organizationId = org.id
      }
      await createProject(workspaceId, {
        name: newName.trim(),
        organization_id: organizationId,
        description: newDesc.trim() || null,
        phase: newPhase || 'Planning',
        datum: newDatum === 'custom' ? (customDatum || null) : (newDatum || null),
        status: 'active',
      })
      setShowNewModal(false)
      setNewName('')
      setNewOrgId('')
      setNewOrgName('')
      setNewDesc('')
      setNewPhase('Planning')
      setNewDatum('WGS84 / UTM 36S')
      setCustomDatum('')
      await fetchProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.')
    } finally {
      setSaving(false)
    }
  }

  const fetchActivities = useCallback(async () => {
    if (!resolvedProjectId) return

    const cached = readCachedActivities(resolvedProjectId)
    const queue = readActivityQueue(resolvedProjectId)

    if (!navigator.onLine) {
      setActivities(mergeActivities(resolvedProjectId, cached, queue))
      return
    }

    try {
      const remote = await listProjectActivities(resolvedProjectId)
      writeCachedActivities(resolvedProjectId, remote.map((a) => ({ ...a, queued: false })))
      setActivities(mergeActivities(resolvedProjectId, remote, queue))
    } catch (err) {
      // Use the locally cached timeline if the server cannot be reached.
      setActivities(mergeActivities(resolvedProjectId, cached, queue))
      if (navigator.onLine) {
        setError(err instanceof Error ? err.message : 'Failed to load activity timeline.')
      }
    }
  }, [resolvedProjectId])

  const flushActivityQueue = useCallback(async () => {
    if (!resolvedProjectId || !navigator.onLine) return
    const queue = readActivityQueue(resolvedProjectId)
    if (queue.creates.length === 0 && queue.deletes.length === 0) return

    for (const id of queue.deletes) {
      try {
        await deleteProjectActivity(id)
      } catch {
        // Ignore deletes that have already been removed by another client.
      }
    }
    queue.deletes = []

    while (queue.creates.length > 0) {
      const create = queue.creates[0]
      try {
        await createProjectActivity(resolvedProjectId, create.content, create.type)
      } catch (err) {
        // Leave the remaining queue in place and stop flushing; the next online
        // event or refresh will retry.
        writeActivityQueue(resolvedProjectId, queue)
        if (navigator.onLine) {
          setError(err instanceof Error ? err.message : 'Failed to sync activity.')
        }
        return
      }
      queue.creates.shift()
    }

    clearActivityQueue(resolvedProjectId)
    await fetchActivities()
  }, [resolvedProjectId, fetchActivities])

  useAsyncAction(fetchActivities, [fetchActivities])

  // Flush any offline activity mutations when the browser comes back online.
  useEffect(() => {
    const handleOnline = () => {
      void flushActivityQueue()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [flushActivityQueue])

  // Also flush on mount / when opening a different project: the `online`
  // event never fires when the app reloads while already online, so a
  // non-empty queue would otherwise sit there indefinitely.
  useAsyncAction(flushActivityQueue, [flushActivityQueue])

  // Re-seed the Settings form only when a DIFFERENT project is opened — an
  // identity-based dependency on `activeProject` would clobber in-progress
  // edits every 15 s, because the silent poll rebuilds the projects array.
  const activeProjectRef = useRef(activeProject)
  useEffect(() => {
    activeProjectRef.current = activeProject
  })
  useEffect(() => {
    const proj = activeProjectRef.current
    if (!proj) return
    const id = window.setTimeout(() => {
      setEditName(proj.name)
      setEditClient(proj.client)
      setEditOrgId(proj.organizationId ?? '')
      setEditPhase(proj.phase)
      setEditDatum(proj.datum)
      setEditAxisConvention(proj.axisConvention === 'xy' ? 'xy' : 'yx')
      setEditCrsType(proj.crsType)
      setEditCrsEpsg(proj.crsEpsg)
      setEditLocalOriginE(String(proj.localOriginE ?? 0))
      setEditLocalOriginN(String(proj.localOriginN ?? 0))
      setEditBearingFormat(proj.bearingFormat || 'azimuth')
      setEditAngleEntry(proj.angleEntry || 'packed')
      setEditCoordDecimals(String(proj.coordDecimals ?? 3))
      setEditStatus(proj.status)
      setEditDesc(proj.description)
    }, 0)
    return () => window.clearTimeout(id)
  }, [resolvedProjectId])

  const handleUpdateProject = async () => {
    if (!activeProject) return
    setSaving(true)
    try {
      await updateProject(activeProject.dbId, {
        name: editName,
        organization_id: editOrgId || null,
        phase: editPhase,
        datum: editDatum,
        axis_convention: editAxisConvention,
        crs_type: editCrsType,
        crs_epsg: editCrsType === 'projected' ? (editCrsEpsg || null) : null,
        local_origin_e: editCrsType === 'local' ? (parseFloat(editLocalOriginE) || 0) : 0,
        local_origin_n: editCrsType === 'local' ? (parseFloat(editLocalOriginN) || 0) : 0,
        bearing_format: editBearingFormat || 'azimuth',
        angle_entry: editAngleEntry || 'packed',
        coord_decimals: Math.min(6, Math.max(0, Math.round(parseInt(editCoordDecimals, 10) || 3))),
        status: editStatus.toLowerCase().replace(/ /g, '_') as ProjectUpdate['status'],
        description: editDesc,
      })
      await fetchProjects()
      setNotice({ type: 'success', message: 'Project configuration updated successfully.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project.')
    } finally {
      setSaving(false)
    }
  }

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newActivityText.trim() || !activeProjectId) return
    setSubmittingActivity(true)

    try {
      if (!navigator.onLine) {
        const tempId = generateLocalId()
        const pending = buildPendingActivity(
          activeProjectId,
          tempId,
          newActivityText.trim(),
          'note',
          userName,
        )
        const currentCache = readCachedActivities(activeProjectId)
        setActivities((prev) => [pending, ...prev])
        writeCachedActivities(activeProjectId, [pending, ...currentCache])
        queueActivityCreate(activeProjectId, tempId, pending.content, 'note', userName)
        setNewActivityText('')
        setNotice({ type: 'info', message: 'Note saved locally and will sync when online.' })
        return
      }

      await createProjectActivity(activeProjectId, newActivityText.trim(), 'note')
      setNewActivityText('')
      await fetchActivities()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity.')
    } finally {
      setSubmittingActivity(false)
    }
  }

  const handleDeleteActivity = async (activityId: string) => {
    if (!activeProjectId) return
    const previousActivities = activities
    setDeletingActivityId(activityId)
    setActivities((prev) => prev.filter((activity) => activity.id !== activityId))

    const trimmedCache = previousActivities.filter((a) => a.id !== activityId)
    writeCachedActivities(activeProjectId, trimmedCache)

    // A queued (never-synced) create has no server row to delete — remove it
    // from the create queue so the next flush doesn't resurrect it (zombie).
    const queue = readActivityQueue(activeProjectId)
    if (queue.creates.some((c) => c.tempId === activityId)) {
      queueActivityDelete(activeProjectId, activityId)
      setNotice({ type: 'success', message: 'Activity deleted.' })
      setDeletingActivityId(null)
      return
    }

    if (!navigator.onLine) {
      queueActivityDelete(activeProjectId, activityId)
      setNotice({ type: 'success', message: 'Activity deleted. Sync will resume when online.' })
      setDeletingActivityId(null)
      return
    }

    try {
      await deleteProjectActivity(activityId)
      await fetchActivities()
      setNotice({ type: 'success', message: 'Activity deleted.' })
    } catch (err) {
      setActivities(previousActivities)
      writeCachedActivities(activeProjectId, previousActivities)
      const message = err instanceof Error ? err.message : 'Failed to delete activity.'
      setError(`${message} If this persists, apply latest Supabase migrations.`)
    } finally {
      setDeletingActivityId(null)
    }
  }

  const handleArchiveProject = async (dbId: string) => {
    try {
      await archiveProject(dbId)
      setSelectedProjectId(null)
      setShowDeleteConfirm(false)
      setDeleteConfirmText('')
      if (activeProjectId === dbId) {
        setProjectRoute(null)
      }
      await fetchProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive project.')
    }
  }

  const handleUnarchiveProject = async (dbId: string) => {
    try {
      await unarchiveProject(dbId)
      setSelectedProjectId(null)
      await fetchProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unarchive project.')
    }
  }

  const handlePermanentDeleteProject = async (dbId: string) => {
    try {
      await deleteProject(dbId)
      setSelectedProjectId(null)
      setShowPermanentDeleteConfirm(false)
      setDeleteConfirmText('')
      if (activeProjectId === dbId) {
        setProjectRoute(null)
      }
      await fetchProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project permanently.')
    }
  }

  const openProject = (p: HubProject) => {
    setProjectRoute(p.dbId)
    setSelectedProjectId(null)
    setShowDeleteConfirm(false)
    setDeleteConfirmText('')
  }

  const exitProject = () => {
    setProjectRoute(null)
  }

  const kpiData = activeProject ? [
    {
      label: 'Team Members',
      value: `${activeProject.members.length}`,
      tone: 'purple' as const,
      icon: <User className="h-4 w-4" />,
    },
    {
      label: 'Deployed Assets',
      value: `${deployedAssets.length}`,
      tone: 'info' as const,
      icon: <Layers className="h-4 w-4" />,
    },
    {
      label: 'Activities',
      value: `${activities.length}`,
      tone: 'success' as const,
      icon: <Activity className="h-4 w-4" />,
    },
    {
      label: 'Status',
      value: activeProject.status,
      sub: `${activeProject.phase} phase`,
      tone: 'warning' as const,
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
  ] : []

  const recentActivities = activities.slice(0, 12)
  const recentActivitySections = useMemo(() => {
    const chunkSize = 4
    const sections: ProjectActivity[][] = []
    for (let i = 0; i < recentActivities.length; i += chunkSize) {
      sections.push(recentActivities.slice(i, i + chunkSize))
    }
    return sections
  }, [recentActivities])
  const timelineSummary = {
    notes: activities.filter(a => a.activity_type === 'note').length,
    actions: activities.filter(a => a.activity_type === 'action').length,
    system: activities.filter(a => a.activity_type === 'system').length,
  }

  const settingsActivitySections = useMemo(() => {
    const chunkSize = 4
    const sections: ProjectActivity[][] = []
    const scoped = activities.slice(0, 12)
    for (let i = 0; i < scoped.length; i += chunkSize) {
      sections.push(scoped.slice(i, i + chunkSize))
    }
    return sections
  }, [activities])

  const clampedOverviewSectionIndex = Math.min(
    overviewActivitySectionIndex,
    Math.max(0, recentActivitySections.length - 1),
  )
  const clampedSettingsSectionIndex = Math.min(
    settingsActivitySectionIndex,
    Math.max(0, settingsActivitySections.length - 1),
  )

  const handleUndeployAsset = async (assetId: string) => {
    try {
      // Merge into existing metadata — a whole-property replace would drop
      // every other key the asset record carries (serials, notes, ...).
      const asset = deployedAssets.find(a => a.id === assetId)
      const metadata = {
        ...((asset?.metadata ?? {}) as Record<string, unknown>),
        current_project_name: null,
      }
      await updateAsset(assetId, { status: 'available', metadata })
      setDeployedAssets(prev => prev.filter(a => a.id !== assetId))
      setNotice({ type: 'success', message: 'Asset checked in successfully.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undeploy asset.')
    }
  }

  // Opening a project never takes the app chrome away: the workspace sidebar,
  // header and page frame stay exactly as the rest of the workspace renders
  // them. Only the satellite survey workbench goes fullscreen.

  if (loading || (activeProjectId && !activeProject && resolvingProjects)) {
    return (
      <div className="w-full p-6">
        <PageLoader />
      </div>
    )
  }

  if (activeProjectId && !activeProject) {
    return (
      <DashboardShell>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FolderOpen /></EmptyMedia>
            <EmptyTitle>Project unavailable</EmptyTitle>
            <EmptyDescription>
              {projectsError || error || 'This project could not be found in the current workspace. It may have been removed or you may no longer have access.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={exitProject}>Back to Projects</Button>
            <Button onClick={() => void fetchProjects()}>Retry</Button>
          </EmptyContent>
        </Empty>
      </DashboardShell>
    )
  }

  if (showNewModal) {
    return (
      <PageForm
        title="New Project"
        description="Set up the project, its client, and its spatial reference."
        onBack={() => setShowNewModal(false)}
        footer={
          <Button type="submit" form="new-project-form" className="w-full sm:w-auto" disabled={saving}>{saving ? 'Creating…' : 'Create Project'}</Button>
        }
      >
        <form id="new-project-form" className="mx-auto w-full max-w-6xl" onSubmit={handleCreateProject}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-6">
              {/* ── Project Details ────────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Project details
                      </CardTitle>
                      <CardDescription>
                        Basic information and client association.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-name">
                        Project Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="new-name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Downtown Highrise Survey"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <ComboboxField
                        label="Client (Organization)"
                        value={newOrgId}
                        onChange={(val) => {
                          setNewOrgId(val);
                          if (val) setNewOrgName('');
                        }}
                        options={organizations.map((org) => ({
                          value: org.id,
                          label: org.name,
                        }))}
                        placeholder="Select or create new..."
                        emptyText="No organizations found."
                        optional
                        optionalLabel="Create new..."
                      />
                      {!newOrgId && (
                        <Input
                          id="new-org-name"
                          name="new-org-name"
                          placeholder="Or type a new organization name..."
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                          className="mt-2"
                        />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-desc">Description</Label>
                      <Textarea
                        id="new-desc"
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Project notes, scope, and deliverables..."
                        rows={3}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Spatial Settings ─────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Spatial & tracking settings
                      </CardTitle>
                      <CardDescription>
                        Define the coordinate system and project phase.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-phase">Phase</Label>
                      <Input
                        id="new-phase"
                        value={newPhase}
                        onChange={(e) => setNewPhase(e.target.value)}
                        placeholder="e.g. Planning, Execution"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <ComboboxField
                        label="Datum"
                        value={newDatum}
                        onChange={(v) => setNewDatum(v)}
                        options={[
                          { value: "WGS84 / UTM 36S", label: "WGS84 / UTM 36S" },
                          { value: "WGS84 / UTM 35S", label: "WGS84 / UTM 35S" },
                          { value: "Arc 1950", label: "Arc 1950" },
                          { value: "custom", label: "Custom EPSG..." },
                        ]}
                        placeholder="Select datum"
                        emptyText="No datums found."
                      />
                      {newDatum === "custom" && (
                        <Input
                          id="custom-datum"
                          name="custom-datum"
                          value={customDatum}
                          onChange={(e) => setCustomDatum(e.target.value)}
                          placeholder="e.g. EPSG:4326"
                          className="mt-2"
                          autoFocus
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Summary ───────────────────────────────────── */}
            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">New project</CardTitle>
                  <CardDescription>Summary at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Client</dt>
                      <dd className="truncate font-medium">
                        {newOrgId
                          ? organizations.find((org) => org.id === newOrgId)
                              ?.name || newOrgId
                          : newOrgName.trim()
                            ? `Create: ${newOrgName.trim()}`
                            : "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Phase</dt>
                      <dd className="truncate font-medium">
                        {newPhase || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Datum</dt>
                      <dd className="truncate font-medium">
                        {newDatum === "custom"
                          ? customDatum || "Custom EPSG..."
                          : newDatum || "—"}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </aside>
          </div>
        </form>
      </PageForm>
    );
  }

  return (
    <DashboardShell className={cn('w-full max-w-none overflow-x-hidden', activeProject && 'h-full min-h-0 gap-0 overflow-hidden sm:gap-0')}>
      {error ? (
        <ErrorNotice tone="danger">
          {error}
        </ErrorNotice>
      ) : null}

      {notice && (
        <div className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm ${notice.type === 'success' ? 'border border-success/30 bg-success/10 text-success' : 'border border-border bg-muted text-foreground'}`} role="status" aria-live="polite">
          <span>{notice.message}</span>
          <Button type="button" variant="ghost" size="icon" onClick={() => setNotice(null)} aria-label="Dismiss notice" className="size-7 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {syncStatus.status !== 'idle' && syncStatus.status !== 'synced' && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm ${
            syncStatus.status === 'error'
              ? 'border border-warning/30 bg-warning/10 text-warning'
              : 'border border-border bg-muted text-foreground'
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="flex items-center gap-2">
            {syncStatus.status === 'syncing' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : syncStatus.status === 'error' &&
              (syncStatus.lastError?.toLowerCase().includes('offline') ? (
                <CloudOff className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              ))}
            {syncStatus.status === 'syncing'
              ? 'Syncing projects…'
              : syncStatus.status === 'error'
                ? syncStatus.lastError?.toLowerCase().includes('offline')
                  ? 'Working offline — sync paused.'
                  : `Sync error: ${syncStatus.lastError ?? 'unknown'}`
                : null}
          </span>
          {syncStatus.status === 'error' && !syncStatus.lastError?.toLowerCase().includes('offline') && (
            <Button variant="ghost" size="sm" onClick={() => void fetchProjects()}>
              Retry
            </Button>
          )}
        </div>
      )}

      {activeProject ? (
        <div className="flex flex-1 overflow-hidden">
          {projectMobileMenuOpen && (
            <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setProjectMobileMenuOpen(false)} />
          )}
          <aside
            className={[
              'shrink-0 flex flex-col transition-transform duration-200 ease-in-out',
              'fixed lg:static inset-y-0 left-0 z-50 lg:z-auto',
              'h-dvh lg:h-auto w-64',
              projectSidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
              'border-r bg-background',
              projectMobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
              'lg:translate-x-0',
            ].join(' ')}
          >
            <div className="p-4 border-b">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={exitProject} title="Back to Projects">
                <ArrowLeft className="h-4 w-4" />
                {!projectSidebarCollapsed && <span>Back to Projects</span>}
              </Button>
              {!projectSidebarCollapsed && (
                <div className="mt-3">
                  <p className="font-semibold truncate">{activeProject.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{activeProject.id}</p>
                </div>
              )}
            </div>
            <nav className="flex-1 overflow-auto p-3 space-y-1" aria-label="Project sections">
              {projectTabs.map((tab) => (
                <Button
                  key={tab}
                  variant={effectiveProjectTab === tab ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-2"
                  onClick={() => { setActiveProjectTab(tab); setProjectMobileMenuOpen(false); }}
                >
                  {tabIcons[tab]}
                  {!projectSidebarCollapsed && <span>{tabLabels[tab]}</span>}
                </Button>
              ))}
            </nav>
            <div className="p-3 border-t">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => setProjectSidebarCollapsed(v => !v)} title={projectSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                {projectSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                {!projectSidebarCollapsed && <span>Collapse</span>}
              </Button>
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4 sm:p-6">
              <header className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <Button variant="outline" size="icon" className="lg:hidden shrink-0" onClick={() => setProjectMobileMenuOpen(true)} aria-label="Open project navigation">
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight truncate">{activeProject.name}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant={statusBadgeVariant[activeProject.status] ?? 'secondary'}>{activeProject.status}</Badge>
                      <span>·</span>
                      <span className="truncate">{activeProject.client}</span>
                      <span>·</span>
                      <span>{activeProject.phase} phase</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedProjectId(activeProject.dbId)}>Details</Button>
                </div>
              </header>

              {effectiveProjectTab === 'earthObservation' ? (
                <ProjectEarthObservationPanel
                  workspaceId={workspaceId}
                  projectId={activeProject.dbId}
                  onNavigate={onNavigate}
                />
              ) : effectiveProjectTab === 'overview' ? (
                <ProjectDashboard
                  kpiData={kpiData}
                  timelineSummary={timelineSummary}
                  recentActivities={recentActivities}
                  recentActivitySections={recentActivitySections}
                  overviewActivitySectionIndex={clampedOverviewSectionIndex}
                  setOverviewActivitySectionIndex={setOverviewActivitySectionIndex}
                  newActivityText={newActivityText}
                  setNewActivityText={setNewActivityText}
                  submittingActivity={submittingActivity}
                  deletingActivityId={deletingActivityId}
                  deployedAssets={deployedAssets}
                  onUndeployAsset={handleUndeployAsset}
                  handleAddActivity={handleAddActivity}
                  handleDeleteActivity={handleDeleteActivity}
                />
              ) : effectiveProjectTab === 'settings' ? (
                <ProjectSettings
                  activeProject={activeProject}
                  editName={editName}
                  setEditName={setEditName}
                  editClient={editClient}
                  organizations={organizations}
                  editOrgId={editOrgId}
                  setEditOrgId={setEditOrgId}
                  editPhase={editPhase}
                  setEditPhase={setEditPhase}
                  editDatum={editDatum}
                  setEditDatum={setEditDatum}
                  editAxisConvention={editAxisConvention}
                  setEditAxisConvention={setEditAxisConvention}
                  editCrsType={editCrsType}
                  setEditCrsType={setEditCrsType}
                  editCrsEpsg={editCrsEpsg}
                  setEditCrsEpsg={setEditCrsEpsg}
                  editLocalOriginE={editLocalOriginE}
                  setEditLocalOriginE={setEditLocalOriginE}
                  editLocalOriginN={editLocalOriginN}
                  setEditLocalOriginN={setEditLocalOriginN}
                  editBearingFormat={editBearingFormat}
                  setEditBearingFormat={setEditBearingFormat}
                  editAngleEntry={editAngleEntry}
                  setEditAngleEntry={setEditAngleEntry}
                  editCoordDecimals={editCoordDecimals}
                  setEditCoordDecimals={setEditCoordDecimals}
                  editStatus={editStatus}
                  setEditStatus={setEditStatus}
                  editDesc={editDesc}
                  setEditDesc={setEditDesc}
                  handleUpdateProject={handleUpdateProject}
                  saving={saving}
                  canEditProjects={canEditProjects}
                  canInviteProjectMembers={canInviteProjectMembers}
                  handleUnarchiveProject={handleUnarchiveProject}
                  setSelectedProject={(project) => setSelectedProjectId(project.dbId)}
                  setShowPermanentDeleteConfirm={setShowPermanentDeleteConfirm}
                  setShowDeleteConfirm={setShowDeleteConfirm}
                  setShowAssignModal={setShowAssignModal}
                  activities={activities}
                  settingsActivitySections={settingsActivitySections}
                  settingsActivitySectionIndex={clampedSettingsSectionIndex}
                  setSettingsActivitySectionIndex={setSettingsActivitySectionIndex}
                  newActivityText={newActivityText}
                  setNewActivityText={setNewActivityText}
                  submittingActivity={submittingActivity}
                  deletingActivityId={deletingActivityId}
                  handleAddActivity={handleAddActivity}
                  handleDeleteActivity={handleDeleteActivity}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <DashboardHeader
            title="Projects"
            subtitle="Manage tracking, computations, and deployments for active field operations"
            actions={
              <Button onClick={() => setShowNewModal(true)} disabled={!canEditProjects} className="gap-2">
                <Plus className="h-4 w-4" /> New Project
              </Button>
            }
          />

          {/* The counts stay as the KPI band; the same numbers drive the filter
              rail below, so a reader can narrow the register from either place. */}
          <KpiGrid>
            {(Object.keys(counts) as (keyof typeof counts)[]).map((tab) => {
              const selected = activeFilter === tab
              return (
                <KpiCard
                  key={tab}
                  title={tab}
                  value={String(counts[tab])}
                  icon={kpiIcons[tab]}
                  tone={selected ? kpiTones[tab] : 'neutral'}
                  onClick={() => setActiveFilter(tab)}
                  className={cn(
                    'transition-colors',
                    selected
                      ? 'border-primary/50 bg-primary/5'
                      : 'hover:bg-accent/50',
                  )}
                />
              )
            })}
          </KpiGrid>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <RailCollapseButton collapsed={railCollapsed} onClick={() => setRailCollapsed((v) => !v)} />
              <span className="text-xs text-muted-foreground">
                {activeFilter === 'All' ? 'All active projects' : activeFilter}
                {' · '}
                {filteredProjects.length} of {projects.length}
              </span>
              {activeFilter !== 'All' && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setActiveFilter('All')}>
                  Clear filter
                </Button>
              )}
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="project-search"
                name="project-search"
                placeholder="Search projects…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-7"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <RegisterWorkspace railCollapsed={railCollapsed} inspectorOpen={!!selectedProject}>
            <RegisterPanel title="Filters" className="wr-rail">
              <FilterGroup label="Scope">
                {(Object.keys(counts) as (keyof typeof counts)[]).map((tab) => (
                  <FilterRow
                    key={tab}
                    label={tab === 'All' ? 'All projects' : tab}
                    count={counts[tab]}
                    active={activeFilter === tab}
                    onClick={() => setActiveFilter(tab)}
                  />
                ))}
              </FilterGroup>
              <FilterGroup label="Phase">
                {Array.from(new Set(projects.map((p) => p.phase).filter(Boolean))).map((phase) => (
                  <FilterRow
                    key={phase}
                    label={phase}
                    count={projects.filter((p) => p.phase === phase).length}
                    active={searchQuery === phase}
                    onClick={() => setSearchQuery(searchQuery === phase ? '' : phase)}
                  />
                ))}
              </FilterGroup>
            </RegisterPanel>

            <div className="wr-register-region wr-panel">
              {filteredProjects.length === 0 ? (
                <Empty className="border-none py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><FolderOpen /></EmptyMedia>
                    <EmptyTitle className="text-base">No projects match your filters</EmptyTitle>
                    <EmptyDescription>
                      Try adjusting your search or filter, or create a new project.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button onClick={() => setShowNewModal(true)} disabled={!canEditProjects} className="gap-2">
                      <Plus className="h-4 w-4" /> New Project
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="wr-register-scroll">
                  <table className="wr-register">
                    <thead>
                      <tr>
                        <th scope="col">Project</th>
                        <th scope="col" className="hidden md:table-cell">Client</th>
                        <th scope="col" className="hidden lg:table-cell">Phase</th>
                        <th scope="col" className="hidden sm:table-cell text-right">Points</th>
                        <th scope="col" className="hidden md:table-cell w-40">Progress</th>
                        <th scope="col" className="text-right">Status</th>
                        <th scope="col" className="w-11"><span className="sr-only">Inspect</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((p) => {
                        return (
                          <tr
                            key={p.dbId}
                            data-selected={selectedProject?.dbId === p.dbId || undefined}
                            onClick={() => openProject(p)}
                            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openProject(p); } }}
                            tabIndex={0}
                            role="button"
                            aria-label={`Open project ${p.name}`}
                          >
                            <td>
                              <div className="min-w-0">
                                <div className="wr-cell-title" title={p.name}>{p.name}</div>
                                <div className="wr-cell-sub font-mono">{p.id}</div>
                              </div>
                            </td>
                            <td className="hidden md:table-cell">
                              <span className="wr-cell-sub" title={p.client}>{p.client}</span>
                            </td>
                            <td className="hidden lg:table-cell">
                              <span className="wr-cell-sub" title={p.phase}>{p.phase}</span>
                            </td>
                            <td className="hidden sm:table-cell text-right">
                              <span className="wr-num">{p.points.toLocaleString()}</span>
                            </td>
                            <td className="hidden md:table-cell">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                                </div>
                                <span className="wr-num w-9 text-right">{p.progress}%</span>
                              </div>
                            </td>
                            <td className="text-right">
                              <Badge variant={statusBadgeVariant[p.status] ?? 'secondary'}>{p.status}</Badge>
                            </td>
                            <td className="w-11 px-1 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={`Inspect project ${p.name}`}
                                title="Inspect project"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedProjectId(selectedProjectId === p.dbId ? null : p.dbId)
                                }}
                              >
                                <PanelRightOpen className="size-3.5" aria-hidden="true" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedProject ? (
              <InspectorPanel title="Project record" onClose={() => setSelectedProjectId(null)}>
                <div className="wr-inspector__hero">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold leading-snug text-foreground">{selectedProject.name}</h3>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{selectedProject.id}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant={statusBadgeVariant[selectedProject.status] ?? 'secondary'}>{selectedProject.status}</Badge>
                      {selectedProject.phase ? <Badge variant="outline">{selectedProject.phase}</Badge> : null}
                    </div>
                  </div>
                </div>

                <InspectorSection title="Record">
                  <KeyValues
                    rows={[
                      { label: 'Client', value: selectedProject.client || '—' },
                      { label: 'Surveyor', value: selectedProject.members[0]?.name || 'Unassigned' },
                      { label: 'Datum', value: selectedProject.datum || '—' },
                      { label: 'Points', value: selectedProject.points.toLocaleString(), mono: true },
                    ]}
                  />
                </InspectorSection>

                <InspectorSection title="Progress">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${selectedProject.progress}%` }} />
                    </div>
                    <span className="wr-num">{selectedProject.progress}%</span>
                  </div>
                </InspectorSection>

                <InspectorSection title="Actions">
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => openProject(selectedProject)}
                  >
                    <FolderOpen className="size-4" />
                    Open project workspace
                  </Button>
                </InspectorSection>
              </InspectorPanel>
            ) : null}
          </RegisterWorkspace>

          <RegisterStatus
            total={projects.length}
            shown={filteredProjects.length}
            noun="projects"
            detail={selectedProject ? `Inspecting ${selectedProject.name}` : 'Select a row to inspect'}
          />
        </div>
      )}
    </DashboardShell>
  )
}