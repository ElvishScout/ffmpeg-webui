import { reactive } from "vue";

export interface ToastItem {
  id: number;
  type: "success" | "error";
  text: string;
}

export const toasts = reactive<ToastItem[]>([]);

let nextId = 1;

function push(type: ToastItem["type"], text: string, duration: number) {
  const id = nextId++;
  toasts.push({ id, type, text });
  setTimeout(() => {
    const i = toasts.findIndex((x) => x.id === id);
    if (i !== -1) toasts.splice(i, 1);
  }, duration);
}

export const toast = {
  success: (text: string) => push("success", text, 3000),
  error: (text: string) => push("error", text, 5000),
};
