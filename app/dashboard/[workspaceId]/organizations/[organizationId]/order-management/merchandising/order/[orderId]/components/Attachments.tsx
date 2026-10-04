import React from "react";
import type { OrderFormState } from "./order-form-types";

export default function AttachmentsTab(props: {
  form: OrderFormState;
  setForm: React.Dispatch<React.SetStateAction<OrderFormState>>;
}) {
  void props;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Attachments</h3>
      {/* Component content */}
    </div>
  );
}