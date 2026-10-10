import { createMaster, lookup, text } from "@/lib/master-data/master-data-models";

export const DISTRIBUTION_MASTER_DEFINITIONS = [
  createMaster("warehouse", "Warehouse", "Storage and dispatch location used by Advance Booking workflows.", [
    text("Warehouse_Name", "Warehouse Name", { required: true, unique: true }),
    lookup("Warehouse_Type", "Warehouse Type", "warehouse-type", { required: true }),
    lookup("Location", "Location", "location"),
    text("Incharge_Name", "Incharge Name"),
    text("Phone_Number", "Phone Number"),
  ], { labelField: "Warehouse_Name", moduleGroup: "distribution", moduleSubGroup: "dispatch", moduleOrder: 1 }),
  createMaster("warehouse-type", "Warehouse Type", "Modes or categories of storage locations used for dispatch planning.", [
    text("Warehouse_Type", "Warehouse Type", { required: true, unique: true }),
  ], { labelField: "Warehouse_Type", moduleGroup: "distribution", moduleSubGroup: "dispatch", moduleOrder: 2 }),
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
