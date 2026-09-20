const CONTROL_NAMES = new Set(["button", "input", "select", "textarea"]);

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer the shared ERP UI primitives for interactive controls.",
    },
    schema: [],
    messages: {
      useSharedPrimitive: "Use the shared ERP UI primitive instead of a raw <{{name}}> (hidden inputs are allowed).",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = node.name?.name;
        if (!CONTROL_NAMES.has(name)) return;

        if (name === "input") {
          const typeAttribute = node.attributes.find(
            (attribute) => attribute.type === "JSXAttribute" && attribute.name.name === "type",
          );
          if (typeAttribute?.value?.type === "Literal" && typeAttribute.value.value === "hidden") return;
        }

        context.report({
          node,
          messageId: "useSharedPrimitive",
          data: { name },
        });
      },
    };
  },
};

export default rule;
