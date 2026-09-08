export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export interface DropdownOption {
  key: string;
  /** 函数标签在渲染时求值,保证语言切换后菜单文案更新 */
  label: string | (() => string);
  disabled?: boolean;
}
