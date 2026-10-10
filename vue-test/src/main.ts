import { createApp, defineComponent, h, ref, type VNode } from 'vue';
import {
  Background,
  Title,
  Card,
  Button,
  Divider,
  Switch,
  Select,
  Input,
  Modal,
  Tag,
  Badge,
  Collapse,
  Footer,
} from 'animal-island-vue';
import 'animal-island-vue/style';
import './index.css';

const MODES: ReadonlyArray<readonly [string, string]> = [
  ['orbit', '旋转'],
  ['terrain', '地形'],
  ['item', '物品'],
];

const BLOCKS = ['🪣', '🌱', '🟫', '⬜', '🍃'];

const ADAPTER_OPTIONS = [
  { key: 'auto', label: '自动' },
  { key: 'three', label: 'Three' },
  { key: 'webgl', label: 'WebGL' },
];

const App = defineComponent({
  name: 'App',
  setup() {
    const mode = ref('orbit');
    const ghost = ref(false);
    const adapter = ref('auto');
    const kelvin = ref('5000');
    const intensity = ref(1);
    const open = ref(false);

    return (): VNode =>
      h(Background, { type: 'default' }, {
        default: () => h('div', { class: 'page' }, [
          h(Title, { size: 'large', color: 'app-teal' }, { default: () => '方块花园 · UI 预览' }),
          h(Divider, { type: 'wave-yellow' }),

          h(Card, null, {
            default: () => [
              h('div', { class: 'label' }, '模式'),
              h('div', { class: 'row' }, MODES.map(([key, label]) =>
                h(Button, {
                  key,
                  type: mode.value === key ? 'primary' : 'default',
                  onClick: () => { mode.value = key; },
                }, { default: () => label }),
              )),
            ],
          }),

          h(Card, null, {
            default: () => [
              h('div', { class: 'label' }, '方块'),
              h('div', { class: 'row' }, BLOCKS.map((b) =>
                h(Button, { key: b, size: 'large' }, { default: () => b }),
              )),
            ],
          }),

          h(Card, null, {
            default: () => [
              h('div', { class: 'label' }, '操作'),
              h('div', { class: 'row' }, [
                h(Button, null, { default: () => '撤销' }),
                h(Button, { danger: true }, { default: () => '清空' }),
                h(Button, { type: 'primary' }, { default: () => '保存' }),
                h(Button, { type: 'primary' }, { default: () => '分享' }),
              ]),
            ],
          }),

          h(Card, null, {
            default: () => [
              h('div', { class: 'line' }, [
                h('span', { class: 'k' }, '半透明道具'),
                h(Switch, {
                  modelValue: ghost.value,
                  checkedChildren: '开',
                  unCheckedChildren: '关',
                  'onUpdate:modelValue': (v: boolean) => { ghost.value = v; },
                }),
              ]),
              h('div', { class: 'line' }, [
                h('span', { class: 'k' }, '适配器'),
                h(Select, {
                  modelValue: adapter.value,
                  options: ADAPTER_OPTIONS,
                  'onUpdate:modelValue': (v: string) => { adapter.value = v; },
                }),
              ]),
              h('div', { class: 'line' }, [
                h('span', { class: 'k' }, '色温'),
                h(Input, {
                  size: 'small',
                  modelValue: kelvin.value,
                  allowClear: true,
                  'onUpdate:modelValue': (v: string) => { kelvin.value = v; },
                }),
              ]),
              h('div', { class: 'line' }, [
                h('span', { class: 'k' }, '强度'),
                h('input', {
                  class: 'range',
                  type: 'range',
                  min: 0,
                  max: 2,
                  step: 0.02,
                  value: intensity.value,
                  onInput: (e: Event) => { intensity.value = Number((e.target as HTMLInputElement).value); },
                }),
                h('span', { class: 'val' }, intensity.value.toFixed(2)),
              ]),
            ],
          }),

          h(Card, null, {
            default: () => h(Collapse, {
              defaultExpanded: true,
              question: '这是给谁看的？',
              answer: '给在小红书真机 / 模拟器上预览 animal-island-vue 组件效果用；不含 3D 场景与端能力。',
            }),
          }),

          h('div', { class: 'row' }, [
            h(Tag, { color: 'app-teal' }, { default: () => '地形' }),
            h(Tag, { variant: 'outlined', color: 'app-orange' }, { default: () => '物品' }),
            h(Tag, { variant: 'soft', color: 'app-blue' }, { default: () => '道具' }),
            h(Badge, { count: 3, color: 'app-red' }, {
              default: () => h(Button, { size: 'large' }, { default: () => '🪣' }),
            }),
          ]),

          h(Button, { type: 'primary', block: true, onClick: () => { open.value = true; } }, {
            default: () => '打开确认弹窗',
          }),

          h(Modal, {
            open: open.value,
            title: '保存到相册',
            'onUpdate:open': (v: boolean) => { open.value = v; },
            onClose: () => { open.value = false; },
          }, {
            default: () => '这是 Modal 的 blob 裁剪外观，在真机上看看边缘与阴影。',
            footer: () => [
              h(Button, { onClick: () => { open.value = false; } }, { default: () => '取消' }),
              h(Button, { type: 'primary', onClick: () => { open.value = false; } }, { default: () => '确定' }),
            ],
          }),

          h(Footer, { text: 'animal-island-vue 预览' }),
        ]),
      });
  },
});

const rootEl = document.getElementById('root');

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

if (rootEl) createApp(App).mount(rootEl);
