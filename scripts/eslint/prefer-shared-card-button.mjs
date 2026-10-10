const getAttribute = (node, name) =>
  node.attributes.find(
    (attribute) =>
      attribute.type === "JSXAttribute" && attribute.name.name === name,
  );

const getStaticText = (attribute) => {
  if (!attribute?.value) return "";
  if (attribute.value.type === "Literal") return String(attribute.value.value ?? "");
  if (attribute.value.type !== "JSXExpressionContainer") return "";

  const expression = attribute.value.expression;
  if (expression.type === "TemplateLiteral") {
    return expression.quasis.map((quasi) => quasi.value.raw).join(" ");
  }
  if (expression.type === "Literal") return String(expression.value ?? "");
  return "";
};

const preferSharedCardButton = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Use the shared card variant for card-like Button controls.",
    },
    schema: [],
    messages: {
      useCardVariant: "Use variant=\"card\" for card-like Button controls to keep their hover and surface styles consistent.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name?.name !== "Button") return;

        const className = getStaticText(getAttribute(node, "className"));
        if (!className.includes("text-left")) return;

        const isCardLike =
          className.includes("bg-white") ||
          className.includes("erp-surface") ||
          (className.includes("group") && className.includes("border"));
        if (!isCardLike || getAttribute(node, "variant")) return;

        context.report({
          node,
          messageId: "useCardVariant",
        });
      },
    };

  },
};

export default preferSharedCardButton;
