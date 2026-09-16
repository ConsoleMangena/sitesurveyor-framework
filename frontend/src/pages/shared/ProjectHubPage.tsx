import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Plus,
  Search,
  X,
  ArrowLeft,
  LayoutGrid,
  Crosshair,
  Calculator,
  MapPin,
  PenTool,
  Settings,
  Menu,
  ChevronLeft,
  ChevronRight,
  Layers,
  Activity,
  CheckCircle2,
  Archive,
  User,
  FileText,
  FolderOpen,
  CloudOff,
  Loader2,
  RefreshCw,
  ClipboardList,
} from 'lucide-react'

import '../../styles/project-hub.css'
import '../../styles/pages.css'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResponsiveTable } from '@/components/ui/responsive-table'
import { DashboardShell, DashboardHeader } from '@/components/dashboard/DashboardShell.tsx'
import { DashboardCard } from '@/components/dashboard/DashboardCard.tsx'
import { KpiCard } from '@/components/dashboard/KpiCard.tsx'
import { DialogTemplate } from '@/components/templates/DialogTemplate.tsx'
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
import { inviteWorkspaceMember } from '../../lib/repositories/invitations.ts'
import { getMyWorkspaceMembership } from '../../lib/repositories/workspaces.ts'
import { canManageProjects, canManageTeam } from '../../lib/permissions.ts'
import { ProjectDashboard } from '../../features/projects/components/ProjectDashboard.tsx'
import { ProjectSettings } from '../../features/projects/components/ProjectSettings.tsx'
import { ProjectPointsManager } from '../../features/projects/components/ProjectPointsManager.tsx'
import { ProjectOutputsManager } from '../../features/projects/components/ProjectOutputsManager.tsx'
import { ProjectFilesManager } from '../../features/projects/components/ProjectFilesManager.tsx'
import { migrateProjectPointsKey, useProjectPoints } from '../../features/projects/tools/calculators/projectPoints.ts'
import { migrateProjectOutputsKey } from '../../features/projects/tools/calculators/projectOutputs.ts'
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

// CAD workspace is heavy (Three.js + WASM geometry) and only needed on desktop.
// Lazy-load it so mobile builds can strip it out, and it never affects the
// initial bundle even on desktop.
const CadWorkspace = lazy(() =>
  import('../../features/projects/components/CadWorkspace.tsx').then((mod) => ({
    default: mod.CadWorkspace,
  })),
)

import {
  PROJECT_TOOLS,
  PROJECT_TOOLS_BY_ID,
  PINNED_TOOLS,
  NON_CAD_TOOLS,
  COMING_SOON_TOOLS,
  type ProjectTool,
  type ToolCategory,
  type CalcToolId,
} from '../../features/projects/tools/toolRegistry.ts'
import { CalculatorHost } from '../../features/projects/tools/calculators/CalculatorHost.tsx'
import { getProjectMetrics, type ProjectMetrics } from '../../lib/repositories/projectMetrics.ts'
import { isCadPlatformSupported } from '../../lib/platform.ts'

export type HubProject = UiHubProject

interface ProjectHubPageProps {
  userName: string
  workspaceId: string
  onEnterFullscreenProject?: () => void
  onExitFullscreenProject?: () => void
}

type ProjectTab = 'overview' | 'points' | 'files' | 'surveySetup' | 'geodesy' | 'fieldData' | 'drafting' | 'outputs' | 'settings'

const ACTIVE_PROJECT_KEY = 'sitesurveyorActiveProjectId'
const ACTIVE_PROJECT_TAB_KEY = 'sitesurveyorActiveProjectTab'
const ACTIVE_WORKSPACE_VIEW_KEY = 'sitesurveyorActiveWorkspaceView'
const RECENT_TOOLS_KEY = 'sitesurveyorRecentProjectTools'

const VALID_TABS: ProjectTab[] = ['overview', 'points', 'files', 'surveySetup', 'geodesy', 'fieldData', 'drafting', 'outputs', 'settings']

function isValidProjectTab(value: string | null): value is ProjectTab {
  return VALID_TABS.includes(value as ProjectTab)
}

function isValidWorkspaceView(value: string | null): value is 'project' | 'cad' {
  return value === 'project' || value === 'cad'
}

const TAB_TO_CATEGORY: Record<string, ToolCategory> = {
  surveySetup: 'Survey Setup',
  geodesy: 'COGO & Computation',
  fieldData: 'Field Data',
  drafting: 'Drafting & Outputs',
}

const statusBadgeVariant: Record<string, BadgeProps['variant']> = {
  Active: 'success',
  Completed: 'default',
  'On Hold': 'warning',
  Draft: 'secondary',
  Archived: 'secondary',
}

const tabIcons: Record<ProjectTab, React.ReactNode> = {
  overview: <LayoutGrid size={17} />,
  points: <MapPin size={17} />,
  files: <FolderOpen size={17} />,
  surveySetup: <Crosshair size={17} />,
  geodesy: <Calculator size={17} />,
  fieldData: <MapPin size={17} />,
  drafting: <PenTool size={17} />,
  outputs: <FileText size={17} />,
  settings: <Settings size={17} />,
}

const tabLabels: Record<ProjectTab, string> = {
  overview: 'Overview',
  points: 'Coordinates',
  files: 'Files',
  surveySetup: 'Survey Setup',
  geodesy: 'COGO & Computation',
  fieldData: 'Field Data',
  drafting: 'Drafting',
  outputs: 'Outputs',
  settings: 'Settings',
}

export default function ProjectHubPage({ userName, workspaceId, onEnterFullscreenProject, onExitFullscreenProject }: ProjectHubPageProps) {
  const [projects, setProjects] = useState<HubProject[]>([])
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'info'; message: string } | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedProject, setSelectedProject] = useState<HubProject | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignEmail, setAssignEmail] = useState('')
  const [assigningMember, setAssigningMember] = useState(false)
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'ops_manager' | 'finance' | 'sales' | 'technician' | 'viewer' | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => localStorage.getItem(ACTIVE_PROJECT_KEY))
  const [activeProjectTab, setActiveProjectTab] = useState<ProjectTab>(() => {
    const raw = localStorage.getItem(ACTIVE_PROJECT_TAB_KEY)
    return isValidProjectTab(raw) ? raw : 'overview'
  })
  const [activeCalcTool, setActiveCalcTool] = useState<CalcToolId | null>(null)
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<'project' | 'cad'>(() => {
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_VIEW_KEY)
    if (!isValidWorkspaceView(raw)) return 'project'
    if (raw === 'cad' && !isCadPlatformSupported()) return 'project'
    return raw
  })
  const [deployedAssets, setDeployedAssets] = useState<AssetRow[]>([])
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)

  const { projects: projectRows, refresh: refreshProjectRows } = useProjects(workspaceId)

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
  const [activeFilter, setActiveFilter] = useState<'All' | 'Active' | 'Completed' | 'Mine' | 'Archived'>('All')

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

  const projectTabs = useMemo<ProjectTab[]>(() => {
    return (['overview', 'points', 'files', 'surveySetup', 'geodesy', 'fieldData', 'drafting', 'outputs', 'settings'] as ProjectTab[]).filter((tab) => {
      if (tab === 'overview' || tab === 'points' || tab === 'files' || tab === 'outputs' || tab === 'settings') return true
      const cat = TAB_TO_CATEGORY[tab]
      return NON_CAD_TOOLS.some(t => t.category === cat && t.behavior.kind !== 'soon')
    })
  }, [])
  const [toolSearchQuery, setToolSearchQuery] = useState('')
  const [recentToolIds, setRecentToolIds] = useState<string[]>(() => {
    const raw = localStorage.getItem(RECENT_TOOLS_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter((id): id is string => typeof id === 'string').slice(0, 8)
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (activeProjectId) localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId)
    else localStorage.removeItem(ACTIVE_PROJECT_KEY)
  }, [activeProjectId])

  useEffect(() => {
    localStorage.setItem(ACTIVE_PROJECT_TAB_KEY, activeProjectTab)
  }, [activeProjectTab])

  useEffect(() => {
    localStorage.setItem(ACTIVE_WORKSPACE_VIEW_KEY, activeWorkspaceView)
  }, [activeWorkspaceView])

  useEffect(() => {
    let cancelled = false
    if (!activeProjectId) return
    const activeProjectName = projects.find(p => p.dbId === activeProjectId || p.id === activeProjectId)?.name
    listAssets(workspaceId).then((allAssets) => {
      if (cancelled) return
      const projAssets = allAssets.filter(a => {
        const meta = a.metadata as Record<string, unknown>
        return meta?.current_project_name === activeProjectName && a.status === 'deployed'
      })
      setDeployedAssets(projAssets)
    }).catch(() => { if (!cancelled) setDeployedAssets([]) })
    return () => { cancelled = true }
  }, [activeProjectId, projects, workspaceId])

  // Keep the HubProject list in sync with the local-first projectRows.
  // Members are resolved in two bulk queries total — never one fetch per
  // project row (which multiplied with every 15 s silent poll).
  useEffect(() => {
    let cancelled = false
    const map = async () => {
      let membersByProject = new Map<string, ProjectMemberWithProfile[]>()
      try {
        membersByProject = await listProjectMembersForProjects(
          projectRows.map((row) => row.id),
        )
      } catch {
        // Member resolution is best-effort; rows still render without names.
      }
      if (cancelled) return
      const mapped = projectRows.map((row) =>
        mapProjectRowToHubProject(
          row,
          (membersByProject.get(row.id) ?? []).map((m) => ({
            full_name: m.full_name,
            email: m.email,
            role: m.role,
          })),
        ),
      )
      setProjects(mapped)
    }
    void map()
    return () => { cancelled = true }
  }, [projectRows])

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

  useEffect(() => {
    localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(recentToolIds))
  }, [recentToolIds])

  const activeProject = activeProjectId ? projects.find(p => p.dbId === activeProjectId || p.id === activeProjectId) ?? null : null

  const effectiveWorkspaceView = activeProject ? activeWorkspaceView : 'project'

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

  const recentTools = useMemo(() => {
    return recentToolIds
      .map(id => PROJECT_TOOLS_BY_ID[id])
      .filter((t): t is (typeof PROJECT_TOOLS)[number] => Boolean(t) && t.behavior.kind === 'calc')
  }, [recentToolIds])

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
    if (!activeProjectId) return

    const cached = readCachedActivities(activeProjectId)
    const queue = readActivityQueue(activeProjectId)

    if (!navigator.onLine) {
      setActivities(mergeActivities(activeProjectId, cached, queue))
      return
    }

    try {
      const remote = await listProjectActivities(activeProjectId)
      writeCachedActivities(activeProjectId, remote.map((a) => ({ ...a, queued: false })))
      setActivities(mergeActivities(activeProjectId, remote, queue))
    } catch (err) {
      // Use the locally cached timeline if the server cannot be reached.
      setActivities(mergeActivities(activeProjectId, cached, queue))
      if (navigator.onLine) {
        setError(err instanceof Error ? err.message : 'Failed to load activity timeline.')
      }
    }
  }, [activeProjectId])

  const flushActivityQueue = useCallback(async () => {
    if (!activeProjectId || !navigator.onLine) return
    const queue = readActivityQueue(activeProjectId)
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
        await createProjectActivity(activeProjectId, create.content, create.type)
      } catch (err) {
        // Leave the remaining queue in place and stop flushing; the next online
        // event or refresh will retry.
        writeActivityQueue(activeProjectId, queue)
        if (navigator.onLine) {
          setError(err instanceof Error ? err.message : 'Failed to sync activity.')
        }
        return
      }
      queue.creates.shift()
    }

    clearActivityQueue(activeProjectId)
    await fetchActivities()
  }, [activeProjectId, fetchActivities])

  const fetchMetrics = useCallback(async () => {
    if (!activeProjectId) {
      setMetrics(null)
      return
    }
    const m = await getProjectMetrics(activeProjectId)
    setMetrics(m)
  }, [activeProjectId])

  useAsyncAction(fetchActivities, [fetchActivities])
  useAsyncAction(fetchMetrics, [fetchMetrics])

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

  // Move locally stored project points/outputs written under the legacy
  // display-id key onto the stable database id (one-time no-op afterwards).
  const activeDbId = activeProject?.dbId
  const activeDisplayId = activeProject?.id
  useEffect(() => {
    if (!activeDbId) return
    const legacyId = activeDisplayId && activeDisplayId !== activeDbId ? activeDisplayId : null
    migrateProjectPointsKey(activeDbId, legacyId)
    migrateProjectOutputsKey(activeDbId, legacyId)
  }, [activeDbId, activeDisplayId])

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
  }, [activeProjectId])

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
        const tempId = window.crypto.randomUUID()
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

  const handleQuickAction = async (action: string) => {
    if (!activeProjectId) return

    try {
      if (!navigator.onLine) {
        const tempId = window.crypto.randomUUID()
        const content = `Executed: ${action}`
        const pending = buildPendingActivity(
          activeProjectId,
          tempId,
          content,
          'action',
          userName,
        )
        const currentCache = readCachedActivities(activeProjectId)
        setActivities((prev) => [pending, ...prev])
        writeCachedActivities(activeProjectId, [pending, ...currentCache])
        queueActivityCreate(activeProjectId, tempId, content, 'action', userName)
        setNotice({ type: 'info', message: `${action} initialized. Action will sync when online.` })
        return
      }

      await createProjectActivity(activeProjectId, `Executed: ${action}`, 'action')
      await fetchActivities()
      setNotice({ type: 'info', message: `${action} initialized. Action logged to timeline.` })
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to execute ${action}.`)
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
      setSelectedProject(null)
      setShowDeleteConfirm(false)
      setDeleteConfirmText('')
      if (activeProjectId === dbId) {
        setActiveProjectId(null)
        setActiveCalcTool(null)
      }
      await fetchProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive project.')
    }
  }

  const handleUnarchiveProject = async (dbId: string) => {
    try {
      await unarchiveProject(dbId)
      setSelectedProject(null)
      await fetchProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unarchive project.')
    }
  }

  const handlePermanentDeleteProject = async (dbId: string) => {
    try {
      await deleteProject(dbId)
      setSelectedProject(null)
      setShowPermanentDeleteConfirm(false)
      setDeleteConfirmText('')
      if (activeProjectId === dbId) {
        setActiveProjectId(null)
        setActiveCalcTool(null)
      }
      await fetchProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project permanently.')
    }
  }

  const openProject = (p: HubProject) => {
    setActiveProjectTab('overview')
    setActiveProjectId(p.dbId)
    setActiveWorkspaceView('project')
    setActiveCalcTool(null)
    onEnterFullscreenProject?.()
    setSelectedProject(null)
    setShowDeleteConfirm(false)
    setDeleteConfirmText('')
  }

  const exitProject = () => {
    setActiveWorkspaceView('project')
    setActiveProjectId(null)
    setActiveCalcTool(null)
    onExitFullscreenProject?.()
  }

  const openCadWorkspace = async () => {
    if (!activeProjectId) return
    if (window.innerWidth < 768) {
      setNotice({ type: 'info', message: 'Engineering Surveyor CAD requires a larger screen. Please use a tablet or desktop.' })
      return
    }
    if (!isCadPlatformSupported()) {
      setNotice({ type: 'info', message: 'Engineering Surveyor CAD is only available in the Windows desktop app.' })
      return
    }
    setActiveWorkspaceView('cad')
    await handleQuickAction('Tool: Engineering Surveyor CAD')
    setNotice({ type: 'info', message: 'Engineering Surveyor CAD opened in full-screen mode.' })
  }

  const exitCadWorkspace = async () => {
    setActiveWorkspaceView('project')
    if (!activeProjectId) return
    await handleQuickAction('Exit: Engineering Surveyor CAD')
    await fetchMetrics()
    setNotice({ type: 'info', message: 'Returned to project workspace.' })
  }

  const handleToolOpen = async (toolId: string) => {
    const tool = PROJECT_TOOLS_BY_ID[toolId]
    if (!tool || !activeProjectId) return
    setRecentToolIds(prev => [toolId, ...prev.filter(id => id !== toolId)].slice(0, 8))
    switch (tool.behavior.kind) {
      case 'cad':
        await openCadWorkspace()
        return
      case 'calc':
        setActiveCalcTool(tool.behavior.calc)
        return
      case 'soon':
        setNotice({ type: 'info', message: `${tool.label} is coming soon. It is not available yet.` })
        return
    }
  }

  const projectPoints = useProjectPoints(activeProject?.dbId)

  const kpiData = activeProject ? [
    {
      label: 'Coordinates',
      value: `${projectPoints.points.length.toLocaleString()}`,
      sub: 'Project control points',
      accentColor: '#3b82f6',
      icon: <Crosshair size={16} />,
    },
    {
      label: 'Team Members',
      value: `${activeProject.members.length}`,
      sub: 'Personnel currently assigned',
      accentColor: '#8b5cf6',
      icon: <Settings size={16} />,
    },
    {
      label: 'Linework',
      value: `${metrics?.linework ?? 0}`,
      sub: `${metrics?.surfaces ?? 0} TIN surface(s)`,
      accentColor: '#10b981',
      icon: <PenTool size={16} />,
    },
    {
      label: 'QA Flags',
      value: `${metrics?.qaFlags ?? 0}`,
      sub: 'Points coded QA/CHECK to review',
      accentColor: '#f59e0b',
      icon: <LayoutGrid size={16} />,
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
  const settingsActivitySections = useMemo(() => {
    const chunkSize = 4
    const sections: ProjectActivity[][] = []
    const scoped = activities.slice(0, 12)
    for (let i = 0; i < scoped.length; i += chunkSize) {
      sections.push(scoped.slice(i, i + chunkSize))
    }
    return sections
  }, [activities])
  const timelineSummary = {
    notes: activities.filter(a => a.activity_type === 'note').length,
    actions: activities.filter(a => a.activity_type === 'action').length,
    system: activities.filter(a => a.activity_type === 'system').length,
  }

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

  const fullscreenEnterRef = useRef(onEnterFullscreenProject)
  const fullscreenExitRef = useRef(onExitFullscreenProject)
  useEffect(() => { fullscreenEnterRef.current = onEnterFullscreenProject }, [onEnterFullscreenProject])
  useEffect(() => { fullscreenExitRef.current = onExitFullscreenProject }, [onExitFullscreenProject])
  useEffect(() => {
    if (activeProjectId) fullscreenEnterRef.current?.()
    else fullscreenExitRef.current?.()
  }, [activeProjectId])

  if (loading) {
    return (
      <div className="hub-body p-6">
        <PageLoader />
      </div>
    )
  }

  if (showNewModal) {
    return (
      <PageForm
        title="Initialize Project"
        description="Create a new project environment."
        onBack={() => setShowNewModal(false)}
        footer={
          <Button type="submit" form="new-project-form" className="w-full sm:w-auto rounded-none" disabled={saving}>{saving ? 'Creating...' : 'Launch Environment'}</Button>
        }
      >
        <form id="new-project-form" className="space-y-6" onSubmit={handleCreateProject}>
          {/* ── Project Details ────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ClipboardList size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Project Details</h3>
                <p className="text-[11px] text-muted-foreground">Basic information and client association.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-name">Project Name <span className="text-destructive">*</span></Label>
                <Input id="new-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Downtown Highrise Survey" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Client (Organization)</Label>
                <Select
                  value={newOrgId || '__create_new__'}
                  onValueChange={(val) => {
                    const id = val === '__create_new__' ? '' : val;
                    setNewOrgId(id);
                    if (id) setNewOrgName('');
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select or create new..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__create_new__">Create new...</SelectItem>
                    {organizations.map(org => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!newOrgId && (
                  <Input id="new-org-name" name="new-org-name" placeholder="Or type a new organization name..." value={newOrgName} onChange={e => setNewOrgName(e.target.value)} className="mt-2" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-desc">Description</Label>
                <textarea id="new-desc" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Project notes, scope, and deliverables..." rows={3} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[84px] resize-y" />
              </div>
            </div>
          </div>

          {/* ── Spatial Settings ─────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                <MapPin size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Spatial & Tracking Settings</h3>
                <p className="text-[11px] text-muted-foreground">Define the coordinate system and project phase.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-phase">Phase</Label>
                  <Input id="new-phase" value={newPhase} onChange={e => setNewPhase(e.target.value)} placeholder="e.g. Planning, Execution" />
                </div>
                <div className="space-y-1.5">
                  <Label>Datum</Label>
                  <Select value={newDatum} onValueChange={setNewDatum}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WGS84 / UTM 36S">WGS84 / UTM 36S</SelectItem>
                      <SelectItem value="WGS84 / UTM 35S">WGS84 / UTM 35S</SelectItem>
                      <SelectItem value="Arc 1950">Arc 1950</SelectItem>
                      <SelectItem value="custom">Custom EPSG...</SelectItem>
                    </SelectContent>
                  </Select>
                  {newDatum === 'custom' && (
                    <Input id="custom-datum" name="custom-datum" value={customDatum} onChange={e => setCustomDatum(e.target.value)} placeholder="e.g. EPSG:4326" className="mt-2" autoFocus />
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      </PageForm>
    );
  }

  return (
      <DashboardShell className={`hub-body project-hub-body ${activeProject ? 'project-hub-body-fullscreen p-0 gap-0' : ''}`}>
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {notice && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${notice.type === 'success' ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-blue-200 bg-blue-50 text-blue-800'}`} role="status" aria-live="polite">
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-lg leading-none" aria-label="Dismiss notice">×</button>
        </div>
      )}

      {syncStatus.status !== 'idle' && syncStatus.status !== 'synced' && (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-2 text-sm ${
            syncStatus.status === 'error'
              ? 'border border-amber-200 bg-amber-50 text-amber-800'
              : 'border border-blue-200 bg-blue-50 text-blue-800'
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="flex items-center gap-2">
            {syncStatus.status === 'syncing' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : syncStatus.status === 'error' &&
              (syncStatus.lastError?.toLowerCase().includes('offline') ? (
                <CloudOff size={16} />
              ) : (
                <RefreshCw size={16} />
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
            <Button variant="ghost" size="sm" onClick={() => void fetchProjects()} className="rounded-none">
              Retry
            </Button>
          )}
        </div>
      )}

      {activeProject ? (
        <div className={`flex flex-1 overflow-hidden ${projectSidebarCollapsed ? '' : ''} ${activeCalcTool || effectiveWorkspaceView === 'cad' ? '' : ''}`}>
          {projectMobileMenuOpen && (
            <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setProjectMobileMenuOpen(false)} />
          )}
          <aside
            className={[
              'shrink-0 flex flex-col transition-transform duration-200 ease-in-out',
              'fixed lg:static inset-y-0 left-0 z-50 lg:z-auto',
              'h-dvh lg:h-auto w-64',
              projectSidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
              'border-r bg-background shadow-2xl lg:shadow-none',
              projectMobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
              'lg:translate-x-0',
            ].join(' ')}
          >
            <div className="p-4 border-b">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2 rounded-none" onClick={exitProject} title="Back to Projects">
                <ArrowLeft size={16} />
                {!projectSidebarCollapsed && <span>Back to Projects</span>}
              </Button>
              {!projectSidebarCollapsed && (
                <div className="mt-3">
                  <p className="font-semibold truncate">{activeProject.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{activeProject.id}</p>
                </div>
              )}
            </div>
            <nav className="flex-1 overflow-auto p-3 space-y-1">
              {projectTabs.map((tab) => (
                <Button
                  key={tab}
                  variant={effectiveProjectTab === tab ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-2 rounded-none"
                  onClick={() => { setActiveProjectTab(tab); setProjectMobileMenuOpen(false); }}
                >
                  {tabIcons[tab]}
                  {!projectSidebarCollapsed && <span>{tabLabels[tab]}</span>}
                </Button>
              ))}
            </nav>
            <div className="p-3 border-t">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 rounded-none" onClick={() => setProjectSidebarCollapsed(v => !v)} title={projectSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                {projectSidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                {!projectSidebarCollapsed && <span>Collapse</span>}
              </Button>
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            {effectiveWorkspaceView === 'cad' && isCadPlatformSupported() && (
              <Suspense fallback={<PageLoader />}>
                <CadWorkspace activeProject={activeProject} workspaceId={workspaceId} setProjectMobileMenuOpen={setProjectMobileMenuOpen} exitCadWorkspace={exitCadWorkspace} />
              </Suspense>
            )}
            {activeCalcTool && (
              <CalculatorHost calc={activeCalcTool} activeProject={activeProject} onClose={() => setActiveCalcTool(null)} />
            )}
            {(effectiveWorkspaceView !== 'cad' && !activeCalcTool) && (
              <div className="flex flex-col gap-4 p-4 sm:p-6">
                <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Button variant="outline" size="icon" className="lg:hidden shrink-0 rounded-none" onClick={() => setProjectMobileMenuOpen(true)}>
                      <Menu size={18} />
                    </Button>
                    <div className="min-w-0">
                      <h1 className="text-xl font-bold truncate">{activeProject.name}</h1>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{activeProject.id}</code>
                        <span>·</span>
                        <span>{activeProject.client}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isCadPlatformSupported() && (
                      <Button size="sm" onClick={openCadWorkspace} className="rounded-none">Open CAD</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setSelectedProject(activeProject)} className="rounded-none">Details</Button>
                  </div>
                </header>

                {effectiveProjectTab === 'points' ? (
                  <ProjectPointsManager projectId={activeProject?.dbId} />
                ) : effectiveProjectTab === 'files' ? (
                  <ProjectFilesManager projectId={activeProject.dbId} workspaceId={workspaceId} onOpenInCad={openCadWorkspace} />
                ) : effectiveProjectTab === 'overview' ? (
                  <ProjectDashboard
                    kpiData={kpiData}
                    activities={activities}
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
                    handleQuickAction={handleQuickAction}
                    handleDeleteActivity={handleDeleteActivity}
                    pinnedTools={PINNED_TOOLS}
                    comingSoonTools={COMING_SOON_TOOLS}
                    onOpenTool={handleToolOpen}
                  />
                ) : effectiveProjectTab === 'outputs' ? (
                  <ProjectOutputsManager projectId={activeProject?.dbId} workspaceId={workspaceId} />
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
                    setSelectedProject={setSelectedProject}
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
                ) : (
                  <ToolCategoryView
                    activeProjectTab={effectiveProjectTab}
                    toolSearchQuery={toolSearchQuery}
                    setToolSearchQuery={setToolSearchQuery}
                    recentTools={recentTools}
                    handleToolOpen={handleToolOpen}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <DashboardHeader
            title="Projects"
            subtitle="Manage tracking, computations, and deployments for active field operations"
            actions={
              <Button onClick={() => setShowNewModal(true)} disabled={!canEditProjects} className="gap-2 rounded-none">
                <Plus size={16} /> New Project
              </Button>
            }
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5">
            <KpiCard
              title="All"
              value={String(counts.All)}
              subtext="Active projects"
              icon={<Layers className="size-4" />}
            />
            <KpiCard
              title="Active"
              value={String(counts.Active)}
              subtext="In progress"
              icon={<Activity className="size-4" />}
            />
            <KpiCard
              title="Completed"
              value={String(counts.Completed)}
              subtext="Finished"
              icon={<CheckCircle2 className="size-4" />}
            />
            <KpiCard
              title="Mine"
              value={String(counts.Mine)}
              subtext="Assigned to you"
              icon={<User className="size-4" />}
            />
            <KpiCard
              title="Archived"
              value={String(counts.Archived)}
              subtext="Inactive"
              icon={<Archive className="size-4" />}
            />
          </div>

          <DashboardCard
            title="Projects"
            icon={<LayoutGrid size={16} />}
            titleAction={
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="project-search"
                  name="project-search"
                  placeholder="Search reference or client..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-7"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>
            }
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(Object.keys(counts) as (keyof typeof counts)[]).map((tab) => (
                <Button
                  key={tab}
                  variant={activeFilter === tab ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveFilter(tab)}
                  className="gap-1.5 rounded-none"
                >
                  {tab}
                  <Badge variant={activeFilter === tab ? 'secondary' : 'outline'} className="h-5 px-1.5 text-[10px]">{counts[tab]}</Badge>
                </Button>
              ))}
            </div>

            <div className="hidden md:block">
              <ResponsiveTable>
                <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Project</TableHead>
                    <TableHead className="hidden sm:table-cell min-w-[160px]">Client</TableHead>
                  <TableHead className="hidden md:table-cell w-[120px]">Phase</TableHead>
                  <TableHead className="hidden lg:table-cell min-w-[140px]">Surveyor</TableHead>
                  <TableHead className="hidden xl:table-cell min-w-[160px]">Datum</TableHead>
                  <TableHead className="text-right hidden sm:table-cell w-[90px]">Points</TableHead>
                  <TableHead className="hidden md:table-cell w-48">Progress</TableHead>
                  <TableHead className="text-right w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((p) => {
                  const surveyor = p.members[0]?.name || 'Unassigned'
                  return (
                    <TableRow
                      key={p.dbId}
                      className="cursor-pointer"
                      onClick={() => setSelectedProject(p)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedProject(p); } }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open project ${p.name}`}
                    >
                      <TableCell className="align-middle">
                        <div className="flex flex-col">
                          <span className="font-semibold truncate max-w-[260px]" title={p.name}>{p.name}</span>
                          <code className="w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-primary font-medium mt-1">{p.id}</code>
                        </div>
                      </TableCell>
                      <TableCell className="align-middle hidden sm:table-cell font-medium">
                        <span className="block truncate max-w-[160px]" title={p.client}>{p.client}</span>
                      </TableCell>
                      <TableCell className="align-middle hidden md:table-cell text-muted-foreground">
                        <span className="block truncate max-w-[120px]" title={p.phase}>{p.phase}</span>
                      </TableCell>
                      <TableCell className="align-middle hidden lg:table-cell">
                        <span className="block truncate max-w-[160px]" title={surveyor}>{surveyor}</span>
                      </TableCell>
                      <TableCell className="align-middle hidden xl:table-cell text-muted-foreground text-xs">
                        <span className="block truncate max-w-[180px]" title={p.datum}>{p.datum}</span>
                      </TableCell>
                      <TableCell className="align-middle text-right hidden sm:table-cell font-mono font-semibold">{p.points.toLocaleString()}</TableCell>
                      <TableCell className="align-middle hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                          </div>
                          <span className="text-xs font-semibold w-8 text-right">{p.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="align-middle text-right">
                        <Badge variant={statusBadgeVariant[p.status] ?? 'secondary'}>{p.status}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </ResponsiveTable>
            </div>

            {/* Mobile project tiles */}
            <div className="flex flex-col gap-3 md:hidden">
              {filteredProjects.map((p) => {
                const surveyor = p.members[0]?.name || 'Unassigned'
                return (
                  <article
                    key={p.dbId}
                    className="cursor-pointer rounded-lg border border-border/40 bg-muted/30 p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setSelectedProject(p)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedProject(p); } }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open project ${p.name}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block font-semibold truncate" title={p.name}>{p.name}</span>
                        <code className="mt-1 inline-block w-fit rounded bg-background px-1.5 py-0.5 text-xs text-primary font-medium">{p.id}</code>
                      </div>
                      <Badge variant={statusBadgeVariant[p.status] ?? 'secondary'} className="shrink-0">{p.status}</Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="truncate text-muted-foreground">
                        <span className="font-medium text-foreground" title={p.client}>{p.client}</span>
                        {' · '}
                        <span title={p.phase}>{p.phase}</span>
                      </p>
                      <p className="truncate text-muted-foreground">
                        <span title={surveyor}>{surveyor}</span>
                        {' · '}
                        <span className="text-xs" title={p.datum}>{p.datum}</span>
                      </p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="w-9 shrink-0 text-right text-xs font-semibold">{p.progress}%</span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{p.points.toLocaleString()} pts</span>
                    </div>
                  </article>
                )
              })}
            </div>

            {filteredProjects.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">
                {projects.length === 0 ? 'No projects yet. Create your first project to get started.' : 'No projects found.'}
              </div>
            )}
          </DashboardCard>
        </div>
      )}

      {/* Assign Team Member */}
      <DialogTemplate
        open={showAssignModal}
        onOpenChange={(open) => { if (!open) setShowAssignModal(false); }}
        title="Assign Team Member"
        description="Invite a technician to this project."
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setShowAssignModal(false)} className="rounded-none">Cancel</Button>
            <Button type="submit" form="assign-member-form" disabled={assigningMember} className="rounded-none">{assigningMember ? 'Sending...' : 'Send Invitation'}</Button>
          </>
        }
      >
        <form
          id="assign-member-form"
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!assignEmail || !activeProjectId) return
            setAssigningMember(true)
            try {
              const result = await inviteWorkspaceMember({ workspaceId, email: assignEmail, role: 'technician', projectId: activeProjectId, projectRole: 'member' })
              setNotice({
                type: 'info',
                message: result.linkedToProject
                  ? `${assignEmail} was added to the project and invited to the workspace.`
                  : `Invitation generated for ${assignEmail}.`,
              })
              setShowAssignModal(false)
              setAssignEmail('')
              await fetchProjects()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to invite team member.')
            } finally {
              setAssigningMember(false)
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="assign-email">Team Member Email</Label>
            <Input id="assign-email" type="email" placeholder="surveyor@example.com" value={assignEmail} onChange={e => setAssignEmail(e.target.value)} required autoFocus />
          </div>
        </form>
      </DialogTemplate>

      {/* Project Details */}
      <DialogTemplate
        open={selectedProject !== null}
        onOpenChange={(open) => { if (!open) { setSelectedProject(null); setShowDeleteConfirm(false); setShowPermanentDeleteConfirm(false); setDeleteConfirmText(''); } }}
        title={selectedProject?.name ?? "Project Details"}
        description={selectedProject ? (
          <span><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{selectedProject.id}</code> · {selectedProject.phase}</span>
        ) : undefined}
        size="full"
        footer={selectedProject && !showPermanentDeleteConfirm && !showDeleteConfirm ? (
          <>
            {selectedProject.status === 'Archived' ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => handleUnarchiveProject(selectedProject.dbId)} className="rounded-none">Restore Project</Button>
                <Button variant="destructive" onClick={() => setShowPermanentDeleteConfirm(true)} className="rounded-none">Delete Forever</Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(true)} className="rounded-none">Archive Project</Button>
                <Button variant="destructive" onClick={() => setShowPermanentDeleteConfirm(true)} className="rounded-none">Delete Project</Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setSelectedProject(null); setShowDeleteConfirm(false); setShowPermanentDeleteConfirm(false); setDeleteConfirmText(''); }} className="rounded-none">Close</Button>
              <Button onClick={() => openProject(selectedProject)} className="rounded-none">Open Project</Button>
            </div>
          </>
        ) : undefined}
      >
        {selectedProject && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className="rounded-none border p-3 space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Status</span>
                <Badge variant={statusBadgeVariant[selectedProject.status] ?? 'secondary'}>{selectedProject.status}</Badge>
              </div>
              <div className="rounded-none border p-3 space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Client</span>
                <p className="font-medium">{selectedProject.client}</p>
              </div>
              <div className="rounded-none border p-3 space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Datum</span>
                <p className="font-medium">{selectedProject.datum}</p>
              </div>
              <div className="rounded-none border p-3 space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Points</span>
                <p className="font-medium">{selectedProject.points.toLocaleString()}</p>
              </div>
              <div className="rounded-none border p-3 space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Created</span>
                <p className="font-medium">{selectedProject.createdAt}</p>
              </div>
              <div className="rounded-none border p-3 space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Last Activity</span>
                <p className="font-medium">{selectedProject.lastActivity}</p>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progress</span>
              <div className="flex items-center gap-3">
                <div className="h-2.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${selectedProject.progress}%` }} />
                </div>
                <span className="text-sm font-bold w-10 text-right">{selectedProject.progress}%</span>
              </div>
            </div>

            {selectedProject.description && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</span>
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedProject.description}</p>
              </div>
            )}

            {selectedProject.members.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team ({selectedProject.members.length})</span>
                <div className="space-y-2">
                  {selectedProject.members.map((m, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.role}</p>
                      </div>
                      <Badge variant={m.status === 'active' ? 'success' : 'warning'}>{m.status === 'active' ? 'Active' : 'Pending'}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showPermanentDeleteConfirm ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-destructive">Are you sure you want to PERMANENTLY DELETE this project?</p>
                <p className="text-sm text-destructive">This will destroy all related field data. Type <strong>{selectedProject.name}</strong> to confirm.</p>
                <Input id="delete-project-confirm" name="delete-project-confirm" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Type project name to confirm..." autoFocus />
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowPermanentDeleteConfirm(false); setDeleteConfirmText(''); }} className="rounded-none">Cancel</Button>
                  <Button size="sm" variant="destructive" disabled={deleteConfirmText !== selectedProject.name} onClick={() => handlePermanentDeleteProject(selectedProject.dbId)} className="rounded-none">Delete Project Permanently</Button>
                </div>
              </div>
            ) : showDeleteConfirm ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-destructive">Are you sure you want to archive this project?</p>
                <p className="text-sm text-destructive">Type <strong>{selectedProject.name}</strong> to confirm.</p>
                <Input id="archive-project-confirm" name="archive-project-confirm" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Type project name to confirm..." autoFocus />
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} className="rounded-none">Cancel</Button>
                  <Button size="sm" variant="destructive" disabled={deleteConfirmText !== selectedProject.name} onClick={() => handleArchiveProject(selectedProject.dbId)} className="rounded-none">Archive Project</Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogTemplate>
    </DashboardShell>
  )
}

function ToolCard({ tool, index, onOpen }: { tool: ProjectTool; index: number; onOpen: (id: string) => void }) {
  const comingSoon = tool.behavior.kind === 'soon'
  const disabled = comingSoon
  const cardRef = useRef<HTMLDivElement | null>(null)
  const Icon = tool.icon

  return (
    <div
      ref={cardRef}
      className={`group flex items-center gap-3 rounded-none border bg-card p-3 cursor-pointer transition-all hover:shadow-sm hover:border-primary/30 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      onClick={() => { if (!disabled) onOpen(tool.id) }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(tool.id) }
        else if (e.key === 'ArrowRight') {
          e.preventDefault()
          const siblings = cardRef.current?.parentElement?.querySelectorAll<HTMLElement>('[tabindex="0"]')
          siblings?.[index + 1]?.focus()
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          const siblings = cardRef.current?.parentElement?.querySelectorAll<HTMLElement>('[tabindex="0"]')
          siblings?.[index - 1]?.focus()
        }
      }}
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-disabled={disabled}
      title={tool.label}
    >
      <div className="inline-flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors h-9 w-9">
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold truncate">{tool.label}</h4>
          {comingSoon ? (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Soon</Badge>
          ) : (
            <Badge variant="success" className="text-[10px] px-1.5 py-0">Free</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{tool.description}</p>
      </div>
    </div>
  )
}

function ToolCategoryView({
  activeProjectTab,
  toolSearchQuery,
  setToolSearchQuery,
  recentTools,
  handleToolOpen,
}: {
  activeProjectTab: ProjectTab
  toolSearchQuery: string
  setToolSearchQuery: (q: string) => void
  recentTools: ProjectTool[]
  handleToolOpen: (id: string) => void
}) {
  const activeCat = TAB_TO_CATEGORY[activeProjectTab]
  const query = toolSearchQuery.trim().toLowerCase()
  const CATEGORY_ORDER: Array<ProjectTool['category']> = [
    'Survey Setup',
    'COGO & Computation',
    'Field Data',
    'Drafting & Outputs',
  ]

  const listableTools = useMemo(
    () => NON_CAD_TOOLS.filter(t => t.behavior.kind !== 'soon'),
    [],
  )

  const visible = useMemo(() => {
    const q = toolSearchQuery.trim().toLowerCase()
    const matchesQuery = (t: ProjectTool) => {
      if (!q) return true
      return `${t.label} ${t.description}`.toLowerCase().includes(q)
    }
    return q
      ? listableTools.filter(t => matchesQuery(t))
      : listableTools.filter(t => t.category === activeCat && matchesQuery(t))
  }, [toolSearchQuery, activeCat, listableTools])

  const grouped = new Map<ProjectTool['category'], ProjectTool[]>()
  for (const cat of CATEGORY_ORDER) {
    const catTools = visible.filter(t => t.category === cat)
    if (catTools.length) grouped.set(cat, catTools)
  }

  const empty = visible.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{query ? 'Search results' : activeCat}</h3>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input id="tool-search" name="tool-search" placeholder="Search tools..." value={toolSearchQuery} onChange={(e) => setToolSearchQuery(e.target.value)} aria-label="Search tools" className="h-9 pl-8 pr-7 text-sm" />
          {toolSearchQuery && (
            <button type="button" onClick={() => setToolSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {recentTools.length > 0 && !query && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recently used</h4>
          <div className="flex flex-wrap gap-2">
            {recentTools.slice(0, 6).map(tool => (
              <Button key={`recent-${tool.id}`} variant="outline" size="sm" onClick={() => handleToolOpen(tool.id)} disabled={tool.behavior.kind === 'soon'} className="gap-2 h-8 text-xs rounded-none">
                <tool.icon size={14} strokeWidth={2} aria-hidden="true" />
                {tool.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {!empty ? (
        <div>
          {Array.from(grouped.entries()).map(([cat, tools]) => (
            <section key={cat} className="mb-5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{cat}</h4>
              {cat === 'COGO & Computation' ? (
                <div className="flex flex-col gap-3" role="list">
                  {tools.map((tool, idx) => (
                    <article
                      key={tool.id}
className="cursor-pointer rounded-none border border-border/40 bg-muted/30 p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      role="listitem"
                      onClick={() => handleToolOpen(tool.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToolOpen(tool.id); } }}
                      tabIndex={0}
                      aria-label={`Open ${tool.label}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-xs font-bold text-muted-foreground">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{tool.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2" title={tool.description}>
                              {tool.description}
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleToolOpen(tool.id) }} className="rounded-none">
                          Open
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2" role="list">
                  {tools.map((tool, i) => <ToolCard key={tool.id} tool={tool} index={i} onOpen={handleToolOpen} />)}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-none border border-dashed p-8 text-center text-muted-foreground">
          <h3 className="text-base font-semibold text-foreground">No standalone tools</h3>
          <p className="text-sm mt-1">This category is handled inside the Engineering Surveyor CAD workspace.</p>
        </div>
      )}
    </div>
  )
}
