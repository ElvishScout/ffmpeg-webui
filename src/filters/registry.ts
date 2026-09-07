import type { FilterSpec, LocalText } from '../types/filter'

/** Non-filter node kinds, defined alongside filters so the palette renders one uniform list. */
export interface SpecialNodeSpec {
  kind: 'stage' | 'output' | 'raw' | 'source'
  name: string
  desc?: LocalText
}

export const SPECIAL_NODES: SpecialNodeSpec[] = [
  {
    kind: 'source', name: 'source',
    desc: { zh: 'lavfi 虚拟源', en: 'lavfi source' },
  },
  {
    kind: 'stage', name: 'stage',
    desc: { zh: '切段,暂存到文件', en: 'Split & cache to file' },
  },
  {
    kind: 'output', name: 'output',
    desc: { zh: '产出最终文件', en: 'Final file' },
  },
  {
    kind: 'raw', name: 'raw',
    desc: { zh: '任意 filter 表达式', en: 'Custom filter expr' },
  },
]

const v = { type: 'video' } as const
const a = { type: 'audio' } as const

/**
 * Declarative filter registry. Adding a filter = adding data here;
 * node param forms are generated from these specs.
 */
export const FILTER_REGISTRY: FilterSpec[] = [
  // ---------- transform ----------
  {
    name: 'scale', category: 'transform',
    desc: { zh: '缩放', en: 'Scale' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'w', type: 'string', default: '', placeholder: '1280 或 -1 或 iw/2' },
      { key: 'h', type: 'string', default: '', placeholder: '720 或 -1' },
      { key: 'flags', type: 'select', default: 'lanczos', options: [
        { value: 'lanczos' }, { value: 'bicubic' }, { value: 'bilinear' }, { value: 'neighbor' },
      ] },
    ],
  },
  {
    name: 'crop', category: 'transform',
    desc: { zh: '裁剪', en: 'Crop' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'w', type: 'string', default: 'iw', placeholder: '宽' },
      { key: 'h', type: 'string', default: 'ih', placeholder: '高' },
      { key: 'x', type: 'string', default: '(in_w-out_w)/2' },
      { key: 'y', type: 'string', default: '(in_h-out_h)/2' },
    ],
  },
  {
    name: 'rotate', category: 'transform',
    desc: { zh: '旋转(弧度)', en: 'Rotate (radians)' },
    inputs: [v], outputs: [v],
    params: [{ key: 'a', type: 'string', default: '0', placeholder: 'PI/2' }],
  },
  {
    name: 'transpose', category: 'transform',
    desc: { zh: '旋转 90° 倍数', en: 'Transpose' },
    inputs: [v], outputs: [v],
    params: [{ key: 'dir', type: 'select', default: 'cclock_flip', options: [
      { value: 'clock' }, { value: 'cclock' }, { value: 'clock_flip' }, { value: 'cclock_flip' },
    ] }],
  },
  { name: 'hflip', category: 'transform', desc: { zh: '水平翻转', en: 'Horizontal flip' }, inputs: [v], outputs: [v], params: [] },
  { name: 'vflip', category: 'transform', desc: { zh: '垂直翻转', en: 'Vertical flip' }, inputs: [v], outputs: [v], params: [] },
  {
    name: 'pad', category: 'transform',
    desc: { zh: '填充画幅', en: 'Pad' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'w', type: 'string', default: 'iw' }, { key: 'h', type: 'string', default: 'ih' },
      { key: 'x', type: 'string', default: '(ow-iw)/2' }, { key: 'y', type: 'string', default: '(oh-ih)/2' },
      { key: 'color', type: 'color', default: 'black' },
    ],
  },
  {
    name: 'fps', category: 'transform',
    desc: { zh: '帧率转换', en: 'Frame rate' },
    inputs: [v], outputs: [v],
    params: [{ key: 'fps', type: 'number', default: 30, min: 1, max: 240 }],
  },
  {
    name: 'setpts', category: 'transform',
    desc: { zh: '视频变速(时间戳)', en: 'Change video speed (PTS)' },
    inputs: [v], outputs: [v],
    params: [{ key: 'expr', type: 'string', default: '0.5*PTS', placeholder: '0.5*PTS = 2x 快' }],
  },
  {
    name: 'trim', category: 'transform',
    desc: { zh: '视频截取(秒)', en: 'Trim video (seconds)' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'start', type: 'number', default: 0, min: 0, step: 0.1 },
      { key: 'end', type: 'number', default: 0, min: 0, step: 0.1, desc: { zh: '0 = 不限制', en: '0 = no limit' } },
    ],
  },
  {
    name: 'setsar', category: 'transform',
    desc: { zh: '设置采样宽高比', en: 'Set SAR' },
    inputs: [v], outputs: [v],
    params: [{ key: 'sar', type: 'string', default: '1' }],
  },
  { name: 'format', category: 'transform', desc: { zh: '像素格式', en: 'Pixel format' }, inputs: [v], outputs: [v],
    params: [{ key: 'pix_fmts', type: 'select', default: 'yuv420p', options: [
      { value: 'yuv420p' }, { value: 'yuv444p' }, { value: 'rgb24' }, { value: 'gray' },
    ] }] },

  // ---------- color / look ----------
  {
    name: 'eq', category: 'color',
    desc: { zh: '亮度/对比度/饱和度', en: 'Brightness/contrast/saturation' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'brightness', type: 'number', default: 0, min: -1, max: 1, step: 0.05 },
      { key: 'contrast', type: 'number', default: 1, min: 0, max: 2, step: 0.05 },
      { key: 'saturation', type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
      { key: 'gamma', type: 'number', default: 1, min: 0.1, max: 10, step: 0.1 },
    ],
  },
  {
    name: 'curves', category: 'color',
    desc: { zh: '曲线', en: 'Curves' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'preset', type: 'select', default: 'none', options: [
        { value: 'none', label: { zh: '无', en: 'None' } }, { value: 'vintage' }, { value: 'lighter' },
        { value: 'darker' }, { value: 'increase_contrast' }, { value: 'negative' },
      ] },
    ],
  },
  {
    name: 'colorbalance', category: 'color',
    desc: { zh: '色彩平衡', en: 'Color balance' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'rs', type: 'number', default: 0, min: -1, max: 1, step: 0.05 },
      { key: 'gs', type: 'number', default: 0, min: -1, max: 1, step: 0.05 },
      { key: 'bs', type: 'number', default: 0, min: -1, max: 1, step: 0.05 },
    ],
  },
  {
    name: 'hue', category: 'color',
    desc: { zh: '色相', en: 'Hue' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'h', type: 'number', default: 0, min: -360, max: 360 },
      { key: 's', type: 'number', default: 1, min: -10, max: 10, step: 0.1 },
    ],
  },
  { name: 'negate', category: 'color', desc: { zh: '反色', en: 'Negate' }, inputs: [v], outputs: [v], params: [] },
  {
    name: 'gblur', category: 'color',
    desc: { zh: '高斯模糊', en: 'Gaussian blur' },
    inputs: [v], outputs: [v],
    params: [{ key: 'sigma', type: 'number', default: 10, min: 0, max: 1024, step: 0.5 }],
  },
  {
    name: 'unsharp', category: 'color',
    desc: { zh: '锐化', en: 'Sharpen' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'luma_amount', type: 'number', default: 1, min: -3, max: 3, step: 0.1 },
    ],
  },
  {
    name: 'noise', category: 'color',
    desc: { zh: '噪点', en: 'Noise' },
    inputs: [v], outputs: [v],
    params: [{ key: 'alls', type: 'number', default: 20, min: 0, max: 100 }],
  },

  // ---------- overlay / combine ----------
  {
    name: 'overlay', category: 'overlay',
    desc: { zh: '画面叠加', en: 'Overlay' },
    inputs: [
      { type: 'video', label: { zh: '主画面', en: 'main' } },
      { type: 'video', label: { zh: '叠加层', en: 'overlay' } },
    ],
    outputs: [v],
    params: [
      { key: 'x', type: 'string', default: '0', placeholder: 'W-w-10' },
      { key: 'y', type: 'string', default: '0', placeholder: 'H-h-10' },
    ],
  },
  {
    name: 'concat', category: 'overlay',
    desc: { zh: '拼接(顺序相连)', en: 'Concat' },
    inputs: [v, v], outputs: [v],
    inputsFrom: 'n',
    params: [
      { key: 'n', type: 'number', default: 2, min: 1, max: 16, desc: { zh: '片段数(=输入口数)', en: 'segment count (= input pads)' } },
      { key: 'v', type: 'number', default: 1, min: 0, max: 1 },
      { key: 'a', type: 'number', default: 0, min: 0, max: 1 },
    ],
  },
  {
    name: 'xstack', category: 'overlay',
    desc: { zh: '网格拼贴', en: 'Grid stack' },
    inputs: [v, v], outputs: [v],
    inputsFrom: 'inputs',
    params: [
      { key: 'inputs', type: 'number', default: 2, min: 2, max: 16 },
      { key: 'layout', type: 'string', default: '0_0|w0_0|0_h0|w0_h0', placeholder: '0_0|w0_0' },
    ],
  },
  {
    name: 'blend', category: 'overlay',
    desc: { zh: '混合两个画面', en: 'Blend' },
    inputs: [v, v], outputs: [v],
    params: [{ key: 'all_mode', type: 'select', default: 'overlay', options: [
      { value: 'overlay' }, { value: 'multiply' }, { value: 'screen' }, { value: 'addition' }, { value: 'average' },
    ] }],
  },

  // ---------- text ----------
  {
    name: 'drawtext', category: 'text',
    desc: { zh: '叠加文字(需字体)', en: 'Draw text' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'text', type: 'string', default: '', placeholder: 'Hello' },
      { key: 'x', type: 'string', default: '(w-text_w)/2' },
      { key: 'y', type: 'string', default: '(h-text_h)/2' },
      { key: 'fontsize', type: 'number', default: 36, min: 1, max: 500 },
      { key: 'fontcolor', type: 'color', default: 'white' },
    ],
  },
  {
    name: 'subtitles', category: 'text',
    desc: { zh: '烧录字幕', en: 'Burn subtitles' },
    inputs: [v], outputs: [v],
    params: [{ key: 'filename', type: 'string', default: '', placeholder: 'subs.srt' }],
  },

  // ---------- audio ----------
  {
    name: 'volume', category: 'audio',
    desc: { zh: '音量', en: 'Volume' },
    inputs: [a], outputs: [a],
    params: [{ key: 'volume', type: 'string', default: '1.0', placeholder: '0.5 / 6dB' }],
  },
  {
    name: 'atrim', category: 'audio',
    desc: { zh: '音频截取(秒)', en: 'Trim audio (seconds)' },
    inputs: [a], outputs: [a],
    params: [
      { key: 'start', type: 'number', default: 0, min: 0, step: 0.1 },
      { key: 'end', type: 'number', default: 0, min: 0, step: 0.1, desc: { zh: '0 = 不限制', en: '0 = no limit' } },
    ],
  },
  {
    name: 'atempo', category: 'audio',
    desc: { zh: '音频变速', en: 'Audio tempo' },
    inputs: [a], outputs: [a],
    params: [{ key: 'tempo', type: 'number', default: 1, min: 0.5, max: 2, step: 0.05 }],
  },
  {
    name: 'afade', category: 'audio',
    desc: { zh: '音频淡入淡出', en: 'Audio fade' },
    inputs: [a], outputs: [a],
    params: [
      { key: 't', type: 'select', default: 'in', options: [{ value: 'in', label: { zh: '淡入', en: 'in' } }, { value: 'out', label: { zh: '淡出', en: 'out' } }] },
      { key: 'st', type: 'number', default: 0, min: 0, step: 0.1, desc: { zh: '开始时间(秒)', en: 'start time (s)' } },
      { key: 'd', type: 'number', default: 1, min: 0, step: 0.1, desc: { zh: '时长(秒)', en: 'duration (s)' } },
    ],
  },
  { name: 'loudnorm', category: 'audio', desc: { zh: '响度标准化', en: 'Loudness normalization' }, inputs: [a], outputs: [a], params: [] },
  {
    name: 'amix', category: 'audio',
    desc: { zh: '混音', en: 'Mix audio' },
    inputs: [a, a], outputs: [a],
    inputsFrom: 'inputs',
    params: [
      { key: 'inputs', type: 'number', default: 2, min: 2, max: 16 },
      { key: 'duration', type: 'select', default: 'longest', options: [{ value: 'longest' }, { value: 'shortest' }, { value: 'first' }] },
    ],
  },
  {
    name: 'acrossfade', category: 'audio',
    desc: { zh: '交叉淡入淡出', en: 'Crossfade' },
    inputs: [a, a], outputs: [a],
    params: [{ key: 'd', type: 'number', default: 2, min: 0, step: 0.1, desc: { zh: '时长(秒)', en: 'duration (s)' } }],
  },
  {
    name: 'aecho', category: 'audio',
    desc: { zh: '回声', en: 'Echo' },
    inputs: [a], outputs: [a],
    params: [
      { key: 'in_gain', type: 'number', default: 0.8, min: 0, max: 1, step: 0.05 },
      { key: 'out_gain', type: 'number', default: 0.3, min: 0, max: 1, step: 0.05 },
      { key: 'delays', type: 'string', default: '1000' },
      { key: 'decays', type: 'string', default: '0.5' },
    ],
  },
  {
    name: 'highpass', category: 'audio',
    desc: { zh: '高通滤波', en: 'High-pass' },
    inputs: [a], outputs: [a],
    params: [{ key: 'f', type: 'number', default: 200, min: 0 }],
  },
  {
    name: 'lowpass', category: 'audio',
    desc: { zh: '低通滤波', en: 'Low-pass' },
    inputs: [a], outputs: [a],
    params: [{ key: 'f', type: 'number', default: 3000, min: 0 }],
  },

  // ---------- io / utility ----------
  {
    name: 'loop', category: 'misc',
    desc: { zh: '循环(图片转视频常用)', en: 'Loop' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'loop', type: 'number', default: -1, desc: { zh: '-1 = 无限', en: '-1 = forever' } },
      { key: 'size', type: 'number', default: 1, min: 1 },
    ],
  },
  {
    name: 'tpad', category: 'misc',
    desc: { zh: '首尾冻结帧延长', en: 'Pad with cloned frames' },
    inputs: [v], outputs: [v],
    params: [
      { key: 'start_duration', type: 'number', default: 0, min: 0, step: 0.1 },
      { key: 'stop_duration', type: 'number', default: 0, min: 0, step: 0.1 },
    ],
  },
  {
    name: 'reverse', category: 'misc',
    desc: { zh: '倒放(内存占用大)', en: 'Reverse (memory hungry)' },
    inputs: [v], outputs: [v], params: [],
  },
  { name: 'areverse', category: 'misc', desc: { zh: '音频倒放', en: 'Reverse audio' }, inputs: [a], outputs: [a], params: [] },
  {
    name: 'split', category: 'misc',
    desc: { zh: '一分多(同源多用)', en: 'Split 1 -> n' },
    inputs: [v], outputs: [v, v],
    outputsFrom: 'n', positionalCount: true,
    params: [{ key: 'n', type: 'number', default: 2, min: 2, max: 8 }],
  },
  { name: 'asplit', category: 'misc', desc: { zh: '音频一分多', en: 'Audio split' }, inputs: [a], outputs: [a, a],
    outputsFrom: 'n', positionalCount: true,
    params: [{ key: 'n', type: 'number', default: 2, min: 2, max: 8 }] },
]

export const filterByName = new Map(FILTER_REGISTRY.map((f) => [f.name, f]))

export const FILTER_CATEGORIES = ['transform', 'color', 'overlay', 'text', 'audio', 'misc'] as const
