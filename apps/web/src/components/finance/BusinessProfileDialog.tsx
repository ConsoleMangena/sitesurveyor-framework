import { Building2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageForm } from "@/components/templates/PageForm.tsx";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessProfile } from "@/lib/businessProfile.ts";

interface BusinessProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BusinessProfile;
  onSave: (profile: BusinessProfile) => void;
}

export function BusinessProfileDialog({
  open,
  onOpenChange,
  profile,
  onSave,
}: BusinessProfileDialogProps) {
  const [draft, setDraft] = useState<BusinessProfile>(profile);

  if (!open) return null;

  const handleSubmit = () => {
    onSave(draft);
    onOpenChange(false);
  };

  return (
    <PageForm
      title={
        <span className="flex items-center gap-2">
          <Building2 size={18} />
          Business Profile
        </span>
      }
      description="These details appear on quotes, invoices and receipts."
      onBack={() => onOpenChange(false)}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Save Profile</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="bp-name">Business name</Label>
          <Input
            id="bp-name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Acme Surveying"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bp-address">Address</Label>
          <Textarea
            id="bp-address"
            rows={2}
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            placeholder="Street, City, Country"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bp-tax">Tax number</Label>
            <Input
              id="bp-tax"
              value={draft.taxNumber}
              onChange={(e) => setDraft({ ...draft, taxNumber: e.target.value })}
              placeholder="Tax/VAT number"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-phone">Phone</Label>
            <Input
              id="bp-phone"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="+..."
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bp-email">Email</Label>
            <Input
              id="bp-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="billing@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-website">Website</Label>
            <Input
              id="bp-website"
              value={draft.website}
              onChange={(e) => setDraft({ ...draft, website: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>
    </PageForm>
  );
}
