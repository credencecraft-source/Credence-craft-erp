import { createMaster, text } from "@/lib/master-data/master-data-models";

export const DISTRIBUTION_MASTER_DEFINITIONS = [
  createMaster("delivery-partner", "Delivery Partner", "Third-party or internal delivery partners used for dispatch execution.", [
    text("Partner_Name", "Partner Name", { required: true, unique: true }),
    text("Contact_Person", "Contact Person"),
    text("Phone_Number", "Phone Number"),
  ], { labelField: "Partner_Name", moduleGroup: "distribution", moduleSubGroup: "delivery", moduleOrder: 1 }),
  createMaster("price-list", "Price List", "Price list records used for sales pricing and Advance Booking fulfillment.", [
    text("Channel_Name", "Price List Name", { required: true, unique: true }),
    text("Channel_Code", "Price List Code"),
    text("Channel_Type", "Price List Type", {
      type: "picklist",
      required: true,
      options: ["Qty Based", "Location Based", "Hierarchy Based", "Role Based"],
    }),
  ], { labelField: "Channel_Name", moduleGroup: "distribution", moduleSubGroup: "sales-order", moduleOrder: 1 }),
  createMaster("dispatch-status", "Dispatch Status", "Dispatch and delivery lifecycle values to track movement readiness.", [
    text("Status_Name", "Status Name", { required: true, unique: true }),
    text("Status_Sequence", "Status Sequence", { type: "number" }),
  ], { labelField: "Status_Name", moduleGroup: "distribution", moduleSubGroup: "delivery", moduleOrder: 2 }),
];
