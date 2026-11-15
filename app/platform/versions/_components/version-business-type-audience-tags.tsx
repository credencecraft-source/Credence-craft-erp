"use client";

import Link from "next/link";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";

interface AudienceTag {
  id: string;
  label: string;
  isActive: boolean;
}

interface VersionBusinessTypeAudienceTagsProps {
  tags: AudienceTag[];
  availableTags: AudienceTag[];
  addTagAction: (formData: FormData) => void | Promise<void>;
  removeTagAction: (formData: FormData) => void | Promise<void>;
}

export default function VersionBusinessTypeAudienceTags({
  tags,
  availableTags,
  addTagAction,
  removeTagAction,
}: VersionBusinessTypeAudienceTagsProps) {
  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Audience tags</h2>
          <p className="mt-1 text-sm text-slate-500">
            Assign tags from the shared platform catalog to this business type and version.
          </p>
        </div>
        <Link href="/platform/tags" className="text-sm font-semibold text-emerald-700 hover:underline">
          Manage tag catalog
        </Link>
      </div>

      {availableTags.length > 0 ? (
        <form action={addTagAction} className="flex flex-wrap items-end gap-3">
          <Select
            label="Available tags"
            name="platformTagId"
            required
            defaultValue=""
            className="min-w-56 flex-1"
          >
            <option value="" disabled>Select a tag...</option>
            {availableTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.label}</option>
            ))}
          </Select>
          <Button type="submit">Assign tag</Button>
        </form>
      ) : (
        <p className="text-sm text-slate-500">
          {tags.length > 0
            ? "All active catalog tags are assigned."
            : "No active tags are available. Add tags in the platform catalog first."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800"
          >
            {tag.label}
            {!tag.isActive && <span className="text-xs font-medium text-slate-500">(inactive)</span>}
            <form
              action={removeTagAction}
              onSubmit={(event) => {
                if (!window.confirm(`Remove the "${tag.label}" tag from this version business type?`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="tagId" value={tag.id} />
              <Button type="submit" variant="destructive" size="sm" aria-label={`Remove ${tag.label} tag`}>
                Remove tag
              </Button>
            </form>
          </span>
        ))}
        {tags.length === 0 && availableTags.length > 0 && (
          <p className="text-sm text-slate-500">No audience tags assigned yet.</p>
        )}
      </div>
    </Card>
  );
}
