import { Popup, POPUP_RESULT, POPUP_TYPE } from '../../../../popup.js';

const ABOUT_ITEMS = Object.freeze([
    { label: '作者', value: '清绝', icon: 'fa-regular fa-user' },
    { label: '博客', value: 'blog.qjyg.de', href: 'https://blog.qjyg.de/blog/gugu-character-card-generator', icon: 'fa-solid fa-book-open' },
    { label: 'GitHub', value: 'qingjue723/gugu-character-card-generator', href: 'https://github.com/qingjue723/gugu-character-card-generator', icon: 'fa-brands fa-github' },
    { label: 'Gitee', value: 'canaan723/gugu-character-card-generator', href: 'https://gitee.com/canaan723/gugu-character-card-generator', icon: 'fa-solid fa-code-branch' },
]);

function renderAction(item) {
    if (!item.href) {
        return `
            <span class="gcg-about-icon" aria-hidden="true">
                <i class="${item.icon}"></i>
            </span>
        `;
    }

    return `
        <button type="button" class="menu_button gcg-about-link" data-about-url="${item.href}" title="打开${item.label}">
            <i class="${item.icon}"></i>
        </button>
    `;
}

function renderItem(item) {
    return `
        <div class="gcg-about-row">
            <div class="gcg-about-main">
                <div class="gcg-about-label">${item.label}</div>
                <div class="gcg-about-value">${item.value}</div>
            </div>
            ${renderAction(item)}
        </div>
    `;
}

function buildRoot() {
    return $(`
        <section class="gcg-about-sheet">
            <header class="gcg-about-hero">
                <div class="gcg-about-title">关于</div>
                <div class="gcg-about-subtitle">咕咕助手 - 角色卡生成器</div>
            </header>

            <section class="gcg-about-card">
                <div class="gcg-section-title">项目信息</div>
                <div class="gcg-about-grid">${ABOUT_ITEMS.map(renderItem).join('')}</div>
            </section>

            <section class="gcg-about-card">
                <div class="gcg-section-title">开源协议</div>
                <div class="gcg-about-license">AGPL-3.0-or-later</div>
            </section>

            <footer class="gcg-about-toolbar">
                <button type="button" class="menu_button gcg-toolbar-button" data-about-close="true">关闭</button>
            </footer>
        </section>
    `);
}

export async function showAboutPopup() {
    const root = buildRoot();
    const popup = new Popup(root, POPUP_TYPE.TEXT, '', {
        okButton: false,
        cancelButton: false,
        wide: false,
        large: false,
        allowVerticalScrolling: true,
        leftAlign: true,
        onOpen: instance => instance.dlg.classList.add('gcg-about-popup'),
    });

    root.on('click', '[data-about-url]', function () {
        const url = $(this).attr('data-about-url');
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    });

    root.on('click', '[data-about-close="true"]', async () => {
        await popup.complete(POPUP_RESULT.CANCELLED);
    });

    await popup.show();
}
