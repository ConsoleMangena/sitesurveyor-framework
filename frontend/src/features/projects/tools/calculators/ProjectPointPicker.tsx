import { findProjectPoint, useProjectPoints } from "./projectPoints.ts";

interface ProjectPointPickerProps {
  projectId?: string;
  value: string;
  onChange: (pointNo: string, point?: { e: number; n: number; z?: number | null }) => void;
  label?: string;
  placeholder?: string;
}

export function ProjectPointPicker({
  projectId,
  value,
  onChange,
  label = "Point no.",
  placeholder = "Type or pick a project point",
}: ProjectPointPickerProps) {
  const { pointNos } = useProjectPoints(projectId);
  const listId = `pt-picker-${label.replace(/\s+/g, "-")}`;

  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <input
        type="text"
        className="input-field"
        value={value}
        list={pointNos.length > 0 ? listId : undefined}
        placeholder={placeholder}
        onChange={(e) => {
          const pointNo = e.target.value;
          const point = projectId ? findProjectPoint(projectId, pointNo) : undefined;
          onChange(pointNo, point ? { e: point.e, n: point.n, z: point.z } : undefined);
        }}
      />
      {pointNos.length > 0 && (
        <datalist id={listId}>
          {pointNos.map((p) => <option key={p} value={p} />)}
        </datalist>
      )}
    </div>
  );
}
