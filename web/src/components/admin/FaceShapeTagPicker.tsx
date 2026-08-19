import { cn } from "@/lib/cn";
import { FACE_SHAPE_TAGS, formatFaceShapeVi } from "@/lib/labels";
import type { FaceShapeTag } from "@/types/product";

const TAG =
  "cursor-pointer rounded-full border px-4 py-2 font-body text-[0.84rem] font-medium";

interface FaceShapeTagPickerProps {
  selected: FaceShapeTag[];
  onChange: (next: FaceShapeTag[]) => void;
}

// Toggle-style buttons over all 6 FaceShape values (T19/T21 Q2 — mockup only shows 5, the real
// picker shows all 6 for consistency with the backend enum).
export function FaceShapeTagPicker({ selected, onChange }: FaceShapeTagPickerProps) {
  function toggle(tag: FaceShapeTag) {
    const isSelected = selected.includes(tag);
    onChange(isSelected ? selected.filter((t) => t !== tag) : [...selected, tag]);
  }

  return (
    <div className="flex flex-wrap gap-2.5" role="group" aria-label="Phù hợp với dáng mặt">
      {FACE_SHAPE_TAGS.map((tag) => {
        const isSelected = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            className={cn(
              TAG,
              isSelected
                ? "border-text bg-text text-bg"
                : "border-border bg-transparent text-text",
            )}
            aria-pressed={isSelected}
            onClick={() => toggle(tag)}
          >
            {formatFaceShapeVi(tag)}
          </button>
        );
      })}
    </div>
  );
}
