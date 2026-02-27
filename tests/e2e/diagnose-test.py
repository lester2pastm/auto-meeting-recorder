"""
诊断测试 - 检查 JavaScript 是否正确加载和执行
"""

from playwright.sync_api import sync_playwright
import os

def diagnose():
    print("\n" + "="*60)
    print("🔍 诊断测试 - 检查 JavaScript 执行情况")
    print("="*60)
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # 收集控制台消息
        console_messages = []
        errors = []
        
        def handle_console(msg):
            console_messages.append(f"[{msg.type}] {msg.text}")
            if msg.type == 'error':
                errors.append(msg.text)
        
        page.on('console', handle_console)
        
        # 收集页面错误
        page_errors = []
        def handle_page_error(error):
            page_errors.append(str(error))
        
        page.on('pageerror', handle_page_error)
        
        try:
            print("\n🌐 访问应用...")
            page.goto('http://localhost:3000')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(3000)
            
            # 检查 JavaScript 是否加载
            print("\n📋 检查 JavaScript 文件加载情况...")
            
            # 检查全局变量
            js_checks = page.evaluate('''() => {
                return {
                    hasI18n: typeof i18n !== 'undefined',
                    hasInitDB: typeof initDB !== 'undefined',
                    hasInitNavigation: typeof initNavigation !== 'undefined',
                    hasSwitchView: typeof switchView !== 'undefined',
                    hasInitApp: typeof initApp !== 'undefined',
                    documentReady: document.readyState,
                    bodyClasses: document.body.className,
                    scriptCount: document.querySelectorAll('script').length,
                    navItemCount: document.querySelectorAll('.nav-item').length,
                    viewCount: document.querySelectorAll('.view').length,
                    activeViewCount: document.querySelectorAll('.view.active').length,
                }
            }''')
            
            print(f"  i18n 存在: {js_checks['hasI18n']}")
            print(f"  initDB 存在: {js_checks['hasInitDB']}")
            print(f"  initNavigation 存在: {js_checks['hasInitNavigation']}")
            print(f"  switchView 存在: {js_checks['hasSwitchView']}")
            print(f"  initApp 存在: {js_checks['hasInitApp']}")
            print(f"  文档状态: {js_checks['documentReady']}")
            print(f"  script 标签数量: {js_checks['scriptCount']}")
            print(f"  导航项数量: {js_checks['navItemCount']}")
            print(f"  视图数量: {js_checks['viewCount']}")
            print(f"  激活视图数量: {js_checks['activeViewCount']}")
            
            # 检查当前激活的视图
            print("\n📋 检查当前视图状态...")
            view_states = page.evaluate('''() => {
                const views = document.querySelectorAll('.view');
                return Array.from(views).map(v => ({
                    id: v.id,
                    classes: v.className,
                    display: window.getComputedStyle(v).display
                }));
            }''')
            
            for vs in view_states:
                print(f"  {vs['id']}: class='{vs['classes']}', display={vs['display']}")
            
            # 尝试手动调用 switchView
            print("\n📋 尝试手动调用 switchView('history')...")
            try:
                page.evaluate('''() => {
                    if (typeof switchView === 'function') {
                        switchView('history');
                    }
                }''')
                page.wait_for_timeout(500)
                
                # 检查结果
                view_states_after = page.evaluate('''() => {
                    const views = document.querySelectorAll('.view');
                    return Array.from(views).map(v => ({
                        id: v.id,
                        classes: v.className,
                        display: window.getComputedStyle(v).display
                    }));
                }''')
                
                print("  调用后视图状态:")
                for vs in view_states_after:
                    print(f"    {vs['id']}: class='{vs['classes']}', display={vs['display']}")
                    
            except Exception as e:
                print(f"  调用失败: {e}")
            
            # 检查控制台消息
            print("\n📋 控制台消息:")
            if console_messages:
                for msg in console_messages[:10]:
                    print(f"  {msg[:150]}")
            else:
                print("  无控制台消息")
            
            # 检查错误
            print("\n📋 错误信息:")
            if errors:
                for err in errors[:5]:
                    print(f"  ❌ {err[:200]}")
            else:
                print("  ✓ 无控制台错误")
            
            if page_errors:
                print("  页面错误:")
                for err in page_errors[:5]:
                    print(f"  ❌ {err[:200]}")
            
            # 截图
            screenshot_dir = os.path.join(os.path.dirname(__file__), 'test-screenshots')
            os.makedirs(screenshot_dir, exist_ok=True)
            page.screenshot(path=os.path.join(screenshot_dir, 'diagnose.png'), full_page=True)
            print("\n📸 诊断截图已保存")
            
        finally:
            browser.close()

if __name__ == '__main__':
    diagnose()
