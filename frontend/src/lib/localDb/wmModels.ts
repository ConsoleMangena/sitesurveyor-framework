import { Model } from '@nozbe/watermelondb'

export class Project extends Model {
  static table = 'projects' as const
}

export class Organization extends Model {
  static table = 'organizations' as const
}

export class Contact extends Model {
  static table = 'contacts' as const
}

export class Asset extends Model {
  static table = 'assets' as const
}

export class AssetCalibration extends Model {
  static table = 'asset_calibrations' as const
}

export class AssetMaintenanceEvent extends Model {
  static table = 'asset_maintenance_events' as const
}

export class TimeEntry extends Model {
  static table = 'time_entries' as const
}

export class ExpenseEntry extends Model {
  static table = 'expense_entries' as const
}

export class Job extends Model {
  static table = 'jobs' as const
}

export class JobEvent extends Model {
  static table = 'job_events' as const
}

export class JobAssignment extends Model {
  static table = 'job_assignments' as const
}

export class JobAssignmentMember extends Model {
  static table = 'job_assignment_members' as const
}

export class JobAssignmentAsset extends Model {
  static table = 'job_assignment_assets' as const
}
