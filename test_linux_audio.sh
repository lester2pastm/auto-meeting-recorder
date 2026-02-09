#!/bin/bash
# 测试 Linux 音频录制完整流程

echo "============================================"
echo "测试 AutoMeetingRecorder Linux 音频录制功能"
echo "============================================"
echo ""

# 创建测试目录
TEST_DIR="/tmp/amr_test_$(date +%s)"
mkdir -p "$TEST_DIR"
echo "测试目录: $TEST_DIR"
echo ""

# 1. 测试 ffmpeg 是否可用
echo "[1/6] 检查 ffmpeg..."
if command -v ffmpeg &> /dev/null; then
    echo "✓ ffmpeg 已安装"
    ffmpeg -version | head -1
else
    echo "✗ ffmpeg 未安装，请先安装 ffmpeg"
    exit 1
fi
echo ""

# 2. 测试 PulseAudio
echo "[2/6] 检查 PulseAudio..."
if command -v pactl &> /dev/null; then
    echo "✓ PulseAudio 可用"
    pactl info | grep "Server Name"
else
    echo "✗ PulseAudio 未安装"
    exit 1
fi
echo ""

# 3. 检测音频设备
echo "[3/6] 检测音频设备..."
echo "可用音频源:"
pacmd list-sources | grep -E "name:|device.description:" | while read line; do
    if [[ $line == *"name:"* ]]; then
        name=$(echo "$line" | grep -oP '(?<=<)[^>]+')
        echo "  - $name"
    fi
done
echo ""

# 4. 测试系统音频录制
echo "[4/6] 测试系统音频录制 (3秒)..."
SYS_DEVICE=$(pacmd list-sources | grep -E "name:" | grep "\.monitor" | head -1 | grep -oP '(?<=<)[^>]+' | sed 's/\.monitor$//')
if [ -z "$SYS_DEVICE" ]; then
    SYS_DEVICE="default"
fi
echo "使用设备: $SYS_DEVICE.monitor"

timeout 5 ffmpeg -f pulse -i "${SYS_DEVICE}.monitor" -t 3 -acodec libopus -b:a 128k -ar 48000 -ac 2 -y "$TEST_DIR/system_audio.webm" 2>&1 | grep -E "size=" | tail -1

if [ -f "$TEST_DIR/system_audio.webm" ]; then
    echo "✓ 系统音频录制成功"
    ls -lh "$TEST_DIR/system_audio.webm"
else
    echo "✗ 系统音频录制失败"
fi
echo ""

# 5. 测试麦克风录制
echo "[5/6] 测试麦克风录制 (3秒)..."
MIC_DEVICE=$(pacmd list-sources | grep -E "name:" | grep -v "\.monitor" | grep "input" | head -1 | grep -oP '(?<=<)[^>]+')
if [ -z "$MIC_DEVICE" ]; then
    MIC_DEVICE="default"
fi
echo "使用设备: $MIC_DEVICE"

timeout 5 ffmpeg -f pulse -i "$MIC_DEVICE" -t 3 -acodec libopus -b:a 128k -ar 48000 -ac 1 -y "$TEST_DIR/microphone.webm" 2>&1 | grep -E "size=" | tail -1

if [ -f "$TEST_DIR/microphone.webm" ]; then
    echo "✓ 麦克风录制成功"
    ls -lh "$TEST_DIR/microphone.webm"
else
    echo "✗ 麦克风录制失败"
fi
echo ""

# 6. 测试音频合并
echo "[6/6] 测试音频合并..."
if [ -f "$TEST_DIR/system_audio.webm" ] && [ -f "$TEST_DIR/microphone.webm" ]; then
    ffmpeg -i "$TEST_DIR/microphone.webm" -i "$TEST_DIR/system_audio.webm" \
        -filter_complex "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=3[aout]" \
        -map "[aout]" -c:a libopus -b:a 128k -ar 48000 -y "$TEST_DIR/combined.webm" 2>&1 | grep -E "size=" | tail -1
    
    if [ -f "$TEST_DIR/combined.webm" ]; then
        echo "✓ 音频合并成功"
        ls -lh "$TEST_DIR/combined.webm"
    else
        echo "✗ 音频合并失败"
    fi
else
    echo "⚠ 跳过合并测试（缺少输入文件）"
fi
echo ""

# 总结
echo "============================================"
echo "测试结果汇总"
echo "============================================"
echo ""
echo "录制文件保存在: $TEST_DIR"
echo ""
ls -lh "$TEST_DIR/" 2>/dev/null || echo "无录制文件"
echo ""
echo "测试完成！"
echo ""
echo "注意事项:"
echo "1. 系统音频录制需要正在播放音频才能有声音"
echo "2. 麦克风录制需要连接麦克风或环境有声音"
echo "3. 如果录制文件大小为 0 或很小，可能是设备选择问题"
