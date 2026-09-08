<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "default" | "primary" | "ghost";
    danger?: boolean;
    dashed?: boolean;
    block?: boolean;
    size?: "tiny" | "small" | "medium";
    disabled?: boolean;
    tag?: "button" | "span";
  }>(),
  { variant: "default", size: "medium", tag: "button" },
);

const sizes: Record<string, string> = {
  tiny: "h-[22px] gap-1 px-1.5 text-[11px]",
  small: "h-7 gap-1.5 px-2.5 text-xs",
  medium: "h-8 gap-1.5 px-3 text-[13px]",
};

const classes = computed(() => {
  let look: string;
  if (props.variant === "primary") {
    if (props.dashed) {
      look = "border-dashed border-accent bg-transparent text-accent hover:bg-accent/10";
    } else if (props.danger) {
      look = "border-danger bg-danger text-white hover:bg-[#f05555]";
    } else {
      look = "border-accent bg-accent text-[#0b1220] hover:bg-[#7ab4fb]";
    }
  } else if (props.variant === "ghost") {
    look = props.danger
      ? "border-transparent bg-transparent text-danger hover:bg-danger/10"
      : "border-transparent bg-transparent text-fg2 hover:bg-white/5 hover:text-fg";
  } else if (props.danger) {
    look = "border-danger/30 bg-danger/10 text-danger hover:bg-danger/20";
  } else {
    look = "border-line bg-card text-fg2 hover:border-[#3f3f4d] hover:text-fg";
    if (props.dashed) look += " border-dashed";
  }
  return [
    "inline-flex items-center justify-center rounded-md border transition-colors select-none",
    sizes[props.size],
    look,
    props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
    props.block ? "w-full" : "",
  ].join(" ");
});
</script>

<template>
  <component
    :is="tag"
    :type="tag === 'button' ? 'button' : undefined"
    :disabled="tag === 'button' ? disabled : undefined"
    :class="classes"
  >
    <slot />
  </component>
</template>
