"use client";

import { useState } from "react";

export default function UIManagementPage() {
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const [primaryColor, setPrimaryColor] = useState("#047857");

  return (
    <div >
      {/* HEADER */}
      <div >
        <div>
          <h1 >UI & Theme Management Center</h1>
          <p >
            Centralized design system controls and component library for Credence Craft ERP.
          </p>
        </div>
        <button >Save System Config</button>
      </div>

      {/* SYSTEM CONTROLS GRID */}
      <div >
        {/* DENSITY CONTROL */}
        <div >
          <span >Layout Density</span>
          <div >
            <button
              onClick={() => setDensity("compact")}
              className={`erp-btn-secondary flex-1 justify-center ${
                density === "compact" ? "bg-emerald-50 border-emerald-600 text-emerald-800 font-bold" : ""
              }`}
            >
              Compact (11px)
            </button>
            <button
              onClick={() => setDensity("comfortable")}
              className={`erp-btn-secondary flex-1 justify-center ${
                density === "comfortable" ? "bg-emerald-50 border-emerald-600 text-emerald-800 font-bold" : ""
              }`}
            >
              Comfortable (13px)
            </button>
          </div>
        </div>

        {/* COLOR SCHEME */}
        <div >
          <span >Brand Primary Accent</span>
          <div >
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              
            />
            <span >{primaryColor}</span>
          </div>
        </div>

        {/* STATUS */}
        <div >
          <span >Design Tokens Status</span>
          <div >
            <span ></span>
            <span >Tailwind v4 @theme active in globals.css</span>
          </div>
        </div>
      </div>

      {/* LIVE COMPONENT PREVIEW GALLERY */}
      <div >
        <h2 >Standardized Component Preview</h2>

        {/* BUTTONS PREVIEW */}
        <div >
          <label >Standard Action Buttons</label>
          <div >
            <button >+ Create Record</button>
            <button >Export Data</button>
            <button >
              Delete
            </button>
          </div>
        </div>

        {/* INPUTS PREVIEW */}
        <div >
          <label >Form Controls & Inputs</label>
          <div >
            <input  placeholder="Standard Text Input..." />
            <select >
              <option>Select Order Status...</option>
              <option>Draft</option>
              <option>Approved</option>
            </select>
            <input type="date"  />
          </div>
        </div>

        {/* DATA TABLE PREVIEW */}
        <div >
          <label >Compact Table Preview</label>
          <div >
            <table >
              <thead >
                <tr>
                  <th >Order ID</th>
                  <th >Buyer Name</th>
                  <th >Status</th>
                  <th >Action</th>
                </tr>
              </thead>
              <tbody >
                <tr>
                  <td >ORD-2026-001</td>
                  <td >Apex Apparel Ltd</td>
                  <td >
                    <span >
                      Approved
                    </span>
                  </td>
                  <td >
                    <button >View</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}