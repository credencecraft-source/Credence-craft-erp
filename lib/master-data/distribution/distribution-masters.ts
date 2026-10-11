import { createMaster, text } from "@/lib/master-data/master-data-models";

export const DISTRIBUTION_MASTER_DEFINITIONS = [
  createMaster("delivery-partner", "Delivery Partner", "Third-party or internal delivery partners used for dispatch execution.", [
    text("Partner_Name", "Partner Name", { required: true, unique: true }),
    text("Contact_Person", "Contact Person"),
    text("Phone_Number", "Phone Number"),
  ], { labelField: "Partner_Name", moduleGroup: "distribution", moduleSubGroup: "delivery", moduleOrder: 1 }),
  createMaster("sales-channel", "Sales Channel", "Customer-facing or order channels used for Advance Booking fulfillment.", [
    text("Channel_Name", "Channel Name", { required: true, unique: true }),
    text("Channel_Code", "Channel Code"),
  ], { labelField: "Channel_Name", moduleGroup: "distribution", moduleSubGroup: "sales-order", moduleOrder: 1 }),
  createMaster("dispatch-status", "Dispatch Status", "Dispatch and delivery lifecycle values to track movement readiness.", [
    text("Status_Name", "Status Name", { required: true, unique: true }),
    text("Status_Sequence", "Status Sequence", { type: "number" }),
  ], { labelField: "Status_Name", moduleGroup: "distribution", moduleSubGroup: "delivery", moduleOrder: 2 }),
];
