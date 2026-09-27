"use client";

import { useEffect } from "react";

const editableControlSelector = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
  "select",
  "textarea",
].join(",");

function updateFieldState(element: Element) {
  if (!element.matches(editableControlSelector)) return;

  const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const trackReadOnly = control.getAttribute("data-erp-field-watch") === "true";
  if (control.matches(":disabled") || "readOnly" in control && control.readOnly && !trackReadOnly
    || control.getAttribute("aria-readonly") === "true" && !trackReadOnly) {
    control.removeAttribute("data-erp-field-state");
    return;
  }

  const isEmpty = control instanceof HTMLSelectElement && control.multiple
    ? !Array.from(control.selectedOptions).some((option) => option.value.trim())
    : control.value.trim() === "";
  const state = isEmpty ? "empty" : "filled";

  control.setAttribute("data-erp-field-state", state);
}

function updateFieldsIn(node: Node) {
  if (!(node instanceof Element)) return;
  updateFieldState(node);
  node.querySelectorAll(editableControlSelector).forEach(updateFieldState);
}

export default function GlobalFormFieldState() {
  useEffect(() => {
    const pendingNodes = new Set<Node>();
    let hydrationReady = false;
    let updateTimer: number | undefined;
    const initialScanTimer = window.setTimeout(() => {
      hydrationReady = true;
      updateFieldsIn(document.body);
    }, 1000);
    const scheduleNodeUpdate = (node: Node) => {
      pendingNodes.add(node);
      if (updateTimer !== undefined) return;
      updateTimer = window.setTimeout(() => {
        updateTimer = undefined;
        const nodes = [...pendingNodes];
        pendingNodes.clear();
        nodes.forEach(updateFieldsIn);
      }, 50);
    };
    const observer = new MutationObserver((mutations) => {
      if (!hydrationReady) return;
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          scheduleNodeUpdate(mutation.target);
        } else {
          mutation.addedNodes.forEach(scheduleNodeUpdate);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "readonly", "aria-readonly", "data-erp-field-watch", "type"],
    });

    const updateEventTarget = (event: Event) => {
      if (!hydrationReady) return;
      if (event.target instanceof Element) updateFieldState(event.target);
    };
    const updateAfterReset = () => window.requestAnimationFrame(() => updateFieldsIn(document.body));

    document.addEventListener("input", updateEventTarget, true);
    document.addEventListener("change", updateEventTarget, true);
    document.addEventListener("focusin", updateEventTarget, true);
    document.addEventListener("reset", updateAfterReset, true);

    return () => {
      observer.disconnect();
      window.clearTimeout(initialScanTimer);
      if (updateTimer !== undefined) window.clearTimeout(updateTimer);
      pendingNodes.clear();
      document.removeEventListener("input", updateEventTarget, true);
      document.removeEventListener("change", updateEventTarget, true);
      document.removeEventListener("focusin", updateEventTarget, true);
      document.removeEventListener("reset", updateAfterReset, true);
    };
  }, []);

  return null;
}