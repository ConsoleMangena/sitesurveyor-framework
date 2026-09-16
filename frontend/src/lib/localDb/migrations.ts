import { schemaMigrations, addColumns, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations'

export const PROJECT_DEFAULTS = {
  axis_convention: 'yx',
  crs_type: 'local',
  local_origin_e: 0,
  local_origin_n: 0,
  bearing_format: 'azimuth',
  angle_entry: 'packed',
  coord_decimals: 3,
} as const

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'projects',
          columns: [
            { name: 'axis_convention', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'projects',
          columns: [
            { name: 'crs_type', type: 'string', isOptional: true },
            { name: 'crs_epsg', type: 'string', isOptional: true },
            { name: 'local_origin_e', type: 'number', isOptional: true },
            { name: 'local_origin_n', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'projects',
          columns: [
            { name: 'bearing_format', type: 'string', isOptional: true },
            { name: 'angle_entry', type: 'string', isOptional: true },
            { name: 'coord_decimals', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        // Backfill project defaults so offline records sync without sending
        // explicit NULLs to the NOT NULL columns added in Supabase migrations
        // 13-15.
        unsafeExecuteSql(
          `update projects set
            axis_convention = coalesce(axis_convention, 'yx'),
            crs_type = coalesce(crs_type, 'local'),
            local_origin_e = coalesce(local_origin_e, 0),
            local_origin_n = coalesce(local_origin_n, 0),
            bearing_format = coalesce(bearing_format, 'azimuth'),
            angle_entry = coalesce(angle_entry, 'packed'),
            coord_decimals = coalesce(coord_decimals, 3)
          where axis_convention is null
             or crs_type is null
             or local_origin_e is null
             or local_origin_n is null
             or bearing_format is null
             or angle_entry is null
             or coord_decimals is null;`,
        ),
      ],
    },
  ],
})
