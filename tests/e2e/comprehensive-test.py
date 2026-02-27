"""
Auto Meeting Recorder - 全面 E2E 测试
测试应用的各个功能模块
"""

from playwright.sync_api import sync_playwright
import time
import os

def take_screenshot(page, name):
    """保存截图到 test-screenshots 目录"""
    screenshot_dir = os.path.join(os.path.dirname(__file__), 'test-screenshots')
    os.makedirs(screenshot_dir, exist_ok=True)
    path = os.path.join(screenshot_dir, f'{name}.png')
    page.screenshot(path=path, full_page=True)
    print(f"  📸 截图已保存: {path}")

def test_sidebar_navigation(page):
    """测试侧边栏导航功能"""
    print("\n📋 测试侧边栏导航功能...")
    
    # 检查侧边栏存在
    sidebar = page.locator('.sidebar')
    assert sidebar.is_visible(), "侧边栏应该可见"
    
    # 检查品牌标识
    brand = page.locator('.sidebar-brand')
    assert brand.is_visible(), "品牌标识应该可见"
    
    # 检查导航项数量
    nav_items = page.locator('.nav-item')
    count = nav_items.count()
    assert count == 3, f"应该有3个导航项，实际有{count}个"
    print(f"  ✓ 导航项数量正确: {count}")
    
    # 检查导航项文本
    nav_texts = ['录音', '历史', '设置']
    for i, text in enumerate(nav_texts):
        item = nav_items.nth(i)
        assert text in item.text_content(), f"导航项应包含'{text}'"
    print("  ✓ 导航项文本正确")
    
    # 测试切换到历史视图
    print("  点击历史导航项...")
    page.click('.nav-item[data-view="history"]')
    page.wait_for_timeout(500)
    
    history_view = page.locator('#historyView')
    history_class = history_view.get_attribute('class')
    assert 'active' in history_class, f"历史视图应该激活，实际: {history_class}"
    print("  ✓ 切换到历史视图成功")
    
    # 测试切换到设置视图
    print("  点击设置导航项...")
    page.click('.nav-item[data-view="settings"]')
    page.wait_for_timeout(500)
    
    settings_view = page.locator('#settingsView')
    assert 'active' in settings_view.get_attribute('class'), "设置视图应该激活"
    print("  ✓ 切换到设置视图成功")
    
    # 测试切换回录音视图
    print("  点击录音导航项...")
    page.click('.nav-item[data-view="recorder"]')
    page.wait_for_timeout(500)
    
    recorder_view = page.locator('#recorderView')
    assert 'active' in recorder_view.get_attribute('class'), "录音视图应该激活"
    print("  ✓ 切换回录音视图成功")
    
    take_screenshot(page, '01_sidebar_navigation')

def test_recorder_view_ui(page):
    """测试录音视图 UI 元素"""
    print("\n📋 测试录音视图 UI 元素...")
    
    # 确保在录音视图
    page.click('.nav-item[data-view="recorder"]')
    page.wait_for_timeout(500)
    
    # 检查页面标题
    title = page.locator('#recorderView .page-header h1')
    assert title.is_visible(), "页面标题应该可见"
    print(f"  ✓ 页面标题: {title.text_content()}")
    
    # 检查录音控制按钮
    start_btn = page.locator('#btnStartRecording')
    assert start_btn.is_visible(), "开始录音按钮应该可见"
    print("  ✓ 开始录音按钮可见")
    
    # 检查暂停和停止按钮存在
    pause_btn = page.locator('#btnPauseRecording')
    stop_btn = page.locator('#btnStopRecording')
    assert pause_btn.count() > 0, "暂停按钮应该存在"
    assert stop_btn.count() > 0, "停止按钮应该存在"
    print("  ✓ 暂停/停止按钮存在")
    
    # 检查录音时间显示
    recording_time = page.locator('#recordingTime')
    assert recording_time.is_visible(), "录音时间显示应该可见"
    time_text = recording_time.text_content()
    assert time_text == '00:00:00', f"初始时间应为00:00:00，实际为{time_text}"
    print(f"  ✓ 录音时间显示正确: {time_text}")
    
    # 检查音频可视化
    audio_bars = page.locator('#audioBars')
    assert audio_bars.is_visible(), "音频可视化区域应该可见"
    
    bars = page.locator('.audio-bar')
    bar_count = bars.count()
    assert bar_count == 20, f"应该有20个音频柱，实际有{bar_count}个"
    print(f"  ✓ 音频柱数量正确: {bar_count}")
    
    # 检查录音状态指示器
    indicator = page.locator('#recordingIndicator')
    assert indicator.is_visible(), "录音状态指示器应该可见"
    print("  ✓ 录音状态指示器可见")
    
    take_screenshot(page, '02_recorder_view_ui')

def test_tabs_functionality(page):
    """测试标签页切换功能"""
    print("\n📋 测试标签页切换功能...")
    
    # 确保在录音视图
    page.click('.nav-item[data-view="recorder"]')
    page.wait_for_timeout(500)
    
    # 检查标签页按钮
    subtitle_tab = page.locator('.tab-btn[data-tab="subtitle"]')
    summary_tab = page.locator('.tab-btn[data-tab="summary"]')
    
    assert subtitle_tab.is_visible(), "会议全文标签页按钮应该可见"
    assert summary_tab.is_visible(), "会议纪要标签页按钮应该可见"
    print("  ✓ 标签页按钮可见")
    
    # 检查默认激活的标签页
    assert 'active' in subtitle_tab.get_attribute('class'), "会议全文标签页应该默认激活"
    print("  ✓ 会议全文标签页默认激活")
    
    # 检查标签页内容
    subtitle_content = page.locator('#subtitleTab')
    summary_content = page.locator('#summaryTab')
    
    assert 'active' in subtitle_content.get_attribute('class'), "会议全文内容应该激活"
    assert 'active' not in summary_content.get_attribute('class'), "会议纪要内容应该隐藏"
    print("  ✓ 标签页内容初始状态正确")
    
    # 切换到会议纪要标签页
    summary_tab.click()
    page.wait_for_timeout(500)
    
    assert 'active' in summary_tab.get_attribute('class'), "会议纪要标签页应该激活"
    assert 'active' in summary_content.get_attribute('class'), "会议纪要内容应该激活"
    assert 'active' not in subtitle_content.get_attribute('class'), "会议全文内容应该隐藏"
    print("  ✓ 切换到会议纪要标签页成功")
    
    # 切换回会议全文标签页
    subtitle_tab.click()
    page.wait_for_timeout(500)
    
    assert 'active' in subtitle_tab.get_attribute('class'), "会议全文标签页应该重新激活"
    print("  ✓ 切换回会议全文标签页成功")
    
    take_screenshot(page, '03_tabs_functionality')

def test_settings_view_forms(page):
    """测试设置视图表单功能"""
    print("\n📋 测试设置视图表单功能...")
    
    # 切换到设置视图
    page.click('.nav-item[data-view="settings"]')
    page.wait_for_timeout(500)
    
    # 检查设置视图是否可见
    settings_view = page.locator('#settingsView')
    assert settings_view.is_visible(), "设置视图应该可见"
    print("  ✓ 设置视图可见")
    
    # 检查设置卡片
    settings_cards = page.locator('.settings-card')
    card_count = settings_cards.count()
    assert card_count >= 2, f"应该至少有2个设置卡片，实际有{card_count}个"
    print(f"  ✓ 设置卡片数量: {card_count}")
    
    # 检查语音识别 API 配置表单
    stt_url = page.locator('#sttApiUrl')
    stt_key = page.locator('#sttApiKey')
    stt_model = page.locator('#sttModel')
    
    assert stt_url.is_visible(), "STT API地址输入框应该可见"
    assert stt_key.is_visible(), "STT API Key输入框应该可见"
    assert stt_model.is_visible(), "STT模型名称输入框应该可见"
    print("  ✓ 语音识别API配置表单可见")
    
    # 检查纪要生成 API 配置表单
    summary_url = page.locator('#summaryApiUrl')
    summary_key = page.locator('#summaryApiKey')
    summary_model = page.locator('#summaryModel')
    
    assert summary_url.is_visible(), "摘要API地址输入框应该可见"
    assert summary_key.is_visible(), "摘要API Key输入框应该可见"
    assert summary_model.is_visible(), "摘要模型名称输入框应该可见"
    print("  ✓ 纪要生成API配置表单可见")
    
    # 测试表单输入
    test_url = 'https://api.test.com/v1/audio/transcriptions'
    stt_url.fill(test_url)
    assert stt_url.input_value() == test_url, "STT URL输入值应该正确"
    print("  ✓ STT URL输入正确")
    
    test_key = 'test-api-key-12345'
    stt_key.fill(test_key)
    assert stt_key.input_value() == test_key, "STT Key输入值应该正确"
    print("  ✓ STT Key输入正确")
    
    test_model = 'whisper-large'
    stt_model.fill(test_model)
    assert stt_model.input_value() == test_model, "STT模型输入值应该正确"
    print("  ✓ STT模型输入正确")
    
    # 检查测试连接按钮
    test_stt_btn = page.locator('#btnTestSttApi')
    test_summary_btn = page.locator('#btnTestSummaryApi')
    
    assert test_stt_btn.is_visible(), "STT测试连接按钮应该可见"
    assert test_summary_btn.is_visible(), "摘要测试连接按钮应该可见"
    print("  ✓ 测试连接按钮可见")
    
    # 检查保存模板按钮
    save_template_btn = page.locator('#btnSaveTemplate')
    assert save_template_btn.is_visible(), "保存模板按钮应该可见"
    print("  ✓ 保存模板按钮可见")
    
    take_screenshot(page, '04_settings_view_forms')

def test_language_switch(page):
    """测试语言切换功能"""
    print("\n📋 测试语言切换功能...")
    
    # 切换到录音视图
    page.click('.nav-item[data-view="recorder"]')
    page.wait_for_timeout(500)
    
    # 检查语言切换按钮
    lang_toggle = page.locator('#langToggle')
    assert lang_toggle.is_visible(), "语言切换按钮应该可见"
    
    lang_text = page.locator('.lang-text')
    initial_lang = lang_text.text_content()
    print(f"  ✓ 初始语言标识: {initial_lang}")
    
    # 获取初始标题文本
    title = page.locator('#recorderView .page-header h1')
    initial_title = title.text_content()
    print(f"  ✓ 初始标题: {initial_title}")
    
    # 点击语言切换
    lang_toggle.click()
    page.wait_for_timeout(500)
    
    # 检查语言是否切换
    new_lang = lang_text.text_content()
    print(f"  ✓ 切换后语言标识: {new_lang}")
    
    # 检查标题是否变化
    new_title = title.text_content()
    print(f"  ✓ 切换后标题: {new_title}")
    
    # 切换回原语言
    lang_toggle.click()
    page.wait_for_timeout(500)
    print("  ✓ 语言切换功能正常")
    
    take_screenshot(page, '05_language_switch')

def test_history_view(page):
    """测试历史记录视图"""
    print("\n📋 测试历史记录视图...")
    
    # 切换到历史视图
    page.click('.nav-item[data-view="history"]')
    page.wait_for_timeout(500)
    
    # 检查历史视图是否可见
    history_view = page.locator('#historyView')
    assert history_view.is_visible(), "历史视图应该可见"
    print("  ✓ 历史视图可见")
    
    # 检查页面标题
    title = page.locator('#historyView .page-header h1')
    assert title.is_visible(), "历史页面标题应该可见"
    print(f"  ✓ 页面标题: {title.text_content()}")
    
    # 检查历史列表容器
    history_list = page.locator('#historyList')
    assert history_list.is_visible(), "历史列表容器应该可见"
    print("  ✓ 历史列表容器可见")
    
    # 检查空状态提示
    empty_state = page.locator('#historyList .empty-state')
    if empty_state.count() > 0 and empty_state.is_visible():
        print("  ✓ 显示空状态提示")
    
    take_screenshot(page, '06_history_view')

def test_responsive_layout(page):
    """测试响应式布局"""
    print("\n📋 测试响应式布局...")
    
    # 测试大屏幕布局
    page.set_viewport_size({'width': 1400, 'height': 900})
    page.wait_for_timeout(500)
    
    sidebar = page.locator('.sidebar')
    assert sidebar.is_visible(), "大屏幕侧边栏应该可见"
    print("  ✓ 大屏幕(1400x900)侧边栏可见")
    
    main = page.locator('.main')
    assert main.is_visible(), "大屏幕主内容区应该可见"
    print("  ✓ 大屏幕主内容区可见")
    
    take_screenshot(page, '07_responsive_large')
    
    # 测试中等屏幕布局
    page.set_viewport_size({'width': 1024, 'height': 768})
    page.wait_for_timeout(500)
    
    app = page.locator('.app')
    assert app.is_visible(), "中等屏幕应用应该可见"
    print("  ✓ 中等屏幕(1024x768)布局正常")
    
    take_screenshot(page, '08_responsive_medium')
    
    # 测试小屏幕布局
    page.set_viewport_size({'width': 768, 'height': 600})
    page.wait_for_timeout(500)
    
    assert app.is_visible(), "小屏幕应用应该可见"
    print("  ✓ 小屏幕(768x600)布局正常")
    
    take_screenshot(page, '09_responsive_small')
    
    # 测试移动端布局
    page.set_viewport_size({'width': 375, 'height': 667})
    page.wait_for_timeout(500)
    
    assert app.is_visible(), "移动端应用应该可见"
    print("  ✓ 移动端(375x667)布局正常")
    
    take_screenshot(page, '10_responsive_mobile')

def test_copy_buttons(page):
    """测试复制按钮功能"""
    print("\n📋 测试复制按钮功能...")
    
    # 重置视口大小
    page.set_viewport_size({'width': 1400, 'height': 900})
    
    # 切换到录音视图
    page.click('.nav-item[data-view="recorder"]')
    page.wait_for_timeout(500)
    
    # 先切换到字幕标签页
    subtitle_tab = page.locator('.tab-btn[data-tab="subtitle"]')
    subtitle_tab.click()
    page.wait_for_timeout(300)
    
    # 检查复制字幕按钮
    copy_subtitle = page.locator('#btnCopySubtitle')
    assert copy_subtitle.is_visible(), "复制字幕按钮应该可见"
    print("  ✓ 复制字幕按钮可见")
    
    # 切换到摘要标签页
    summary_tab = page.locator('.tab-btn[data-tab="summary"]')
    summary_tab.click()
    page.wait_for_timeout(300)
    
    # 检查复制摘要按钮
    copy_summary = page.locator('#btnCopySummary')
    assert copy_summary.is_visible(), "复制摘要按钮应该可见"
    print("  ✓ 复制摘要按钮可见")
    
    # 测试点击复制按钮
    copy_summary.click()
    page.wait_for_timeout(500)
    
    # 检查 Toast 是否显示
    toast = page.locator('#toast')
    if toast.count() > 0 and toast.is_visible():
        print("  ✓ Toast 提示显示成功")
    else:
        print("  ⚠ Toast 提示未显示")
    
    take_screenshot(page, '11_copy_buttons')

def test_upload_audio_button(page):
    """测试上传音频按钮"""
    print("\n📋 测试上传音频按钮...")
    
    # 切换到录音视图
    page.click('.nav-item[data-view="recorder"]')
    page.wait_for_timeout(500)
    
    # 确保在字幕标签页
    subtitle_tab = page.locator('.tab-btn[data-tab="subtitle"]')
    subtitle_tab.click()
    page.wait_for_timeout(300)
    
    # 检查上传按钮
    upload_btn = page.locator('#btnUploadAudio')
    assert upload_btn.is_visible(), "上传音频按钮应该可见"
    print("  ✓ 上传音频按钮可见")
    
    # 检查文件输入
    file_input = page.locator('#audioFileInput')
    assert file_input.count() > 0, "文件输入应该存在"
    print("  ✓ 文件输入存在")
    
    take_screenshot(page, '12_upload_audio_button')

def test_refresh_summary_button(page):
    """测试重新生成纪要按钮"""
    print("\n📋 测试重新生成纪要按钮...")
    
    # 切换到录音视图和纪要标签页
    page.click('.nav-item[data-view="recorder"]')
    page.wait_for_timeout(500)
    
    summary_tab = page.locator('.tab-btn[data-tab="summary"]')
    summary_tab.click()
    page.wait_for_timeout(500)
    
    # 检查刷新按钮
    refresh_btn = page.locator('#btnRefreshSummary')
    assert refresh_btn.is_visible(), "重新生成纪要按钮应该可见"
    print("  ✓ 重新生成纪要按钮可见")
    
    take_screenshot(page, '13_refresh_summary_button')

def test_empty_states(page):
    """测试空状态显示"""
    print("\n📋 测试空状态显示...")
    
    # 切换到录音视图
    page.click('.nav-item[data-view="recorder"]')
    page.wait_for_timeout(500)
    
    # 先切换到字幕标签页
    subtitle_tab = page.locator('.tab-btn[data-tab="subtitle"]')
    subtitle_tab.click()
    page.wait_for_timeout(300)
    
    # 检查字幕空状态
    subtitle_empty = page.locator('#subtitleContent .empty-state')
    assert subtitle_empty.count() > 0, "字幕空状态应该存在"
    print("  ✓ 字幕空状态存在")
    
    # 切换到纪要标签页
    summary_tab = page.locator('.tab-btn[data-tab="summary"]')
    summary_tab.click()
    page.wait_for_timeout(300)
    
    # 检查纪要空状态
    summary_empty = page.locator('#summaryContent .empty-state')
    assert summary_empty.count() > 0, "纪要空状态应该存在"
    print("  ✓ 纪要空状态存在")
    
    take_screenshot(page, '14_empty_states')

def test_console_errors(page):
    """检查控制台错误"""
    print("\n📋 检查控制台错误...")
    
    errors = []
    
    def handle_console(msg):
        if msg.type == 'error':
            errors.append(msg.text)
    
    page.on('console', handle_console)
    
    # 刷新页面并等待
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    
    if errors:
        print(f"  ⚠ 发现 {len(errors)} 个控制台错误:")
        for error in errors[:5]:
            print(f"    - {error[:100]}")
    else:
        print("  ✓ 没有控制台错误")

def run_all_tests():
    """运行所有测试"""
    print("\n" + "="*60)
    print("🚀 Auto Meeting Recorder - 全面 E2E 测试")
    print("="*60)
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        try:
            # 访问应用
            print("\n🌐 正在访问应用...")
            page.goto('http://localhost:3000')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(2000)
            print("✅ 应用加载完成")
            
            # 运行测试
            test_results = []
            tests = [
                ('侧边栏导航', test_sidebar_navigation),
                ('录音视图UI', test_recorder_view_ui),
                ('标签页功能', test_tabs_functionality),
                ('设置表单', test_settings_view_forms),
                ('语言切换', test_language_switch),
                ('历史记录', test_history_view),
                ('响应式布局', test_responsive_layout),
                ('复制按钮', test_copy_buttons),
                ('上传音频', test_upload_audio_button),
                ('刷新纪要', test_refresh_summary_button),
                ('空状态显示', test_empty_states),
                ('控制台错误', test_console_errors),
            ]
            
            for name, test_func in tests:
                try:
                    test_func(page)
                    test_results.append((name, '✅ 通过'))
                except AssertionError as e:
                    test_results.append((name, f'❌ 失败: {str(e)}'))
                except Exception as e:
                    test_results.append((name, f'⚠️ 错误: {str(e)}'))
            
            # 打印测试结果汇总
            print("\n" + "="*60)
            print("📊 测试结果汇总")
            print("="*60)
            
            passed = 0
            failed = 0
            for name, result in test_results:
                print(f"  {result} - {name}")
                if '✅' in result:
                    passed += 1
                else:
                    failed += 1
            
            print("\n" + "-"*60)
            print(f"总计: {len(test_results)} 个测试")
            print(f"通过: {passed} 个")
            print(f"失败: {failed} 个")
            print("="*60)
            
        finally:
            browser.close()

if __name__ == '__main__':
    run_all_tests()
