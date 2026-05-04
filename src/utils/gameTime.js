// 时间系统工具函数

// 时间段定义
export const TIME_PERIODS = {
  MORNING: 'morning',   // 早晨 6:00-10:00
  NOON: 'noon',         // 中午 10:00-14:00
  EVENING: 'evening',   // 傍晚 14:00-18:00
  NIGHT: 'night'        // 晚上 18:00-6:00
};

// 获取时间段
export const getTimePeriod = (hour) => {
  if (hour >= 6 && hour < 10) return TIME_PERIODS.MORNING;
  if (hour >= 10 && hour < 14) return TIME_PERIODS.NOON;
  if (hour >= 14 && hour < 18) return TIME_PERIODS.EVENING;
  return TIME_PERIODS.NIGHT;
};

// 获取时间段中文名称
export const getTimePeriodName = (period) => {
  const names = {
    [TIME_PERIODS.MORNING]: '早晨',
    [TIME_PERIODS.NOON]: '中午',
    [TIME_PERIODS.EVENING]: '傍晚',
    [TIME_PERIODS.NIGHT]: '晚上'
  };
  return names[period] || '未知';
};

// 获取时间段描述
export const getTimePeriodDescription = (period) => {
  const descriptions = {
    [TIME_PERIODS.MORNING]: '清晨的阳光洒大地上，新的一天开始了。',
    [TIME_PERIODS.NOON]: '正午的阳光照耀着，人们开始忙碌起来。',
    [TIME_PERIODS.EVENING]: '夕阳西下，天边泛起了金黄色的光芒。',
    [TIME_PERIODS.NIGHT]: '夜幕降临，四周渐渐安静下来。'
  };
  return descriptions[period] || '';
};

// 星期几中文名称
export const getDayOfWeekName = (dayOfWeek) => {
  const days = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return days[dayOfWeek] || '';
};

// 格式化时间显示（HH:MM）
export const formatTime = (hour, minute) => {
  const h = hour.toString().padStart(2, '0');
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m}`;
};

// 格式化日期显示（YYYY年MM月DD日）
export const formatDate = (year, month, day) => {
  return `${year}年${month}月${day}日`;
};

// 格式化完整日期时间显示
export const formatFullDateTime = (gameTime) => {
  const { year, month, day, hour, minute, dayOfWeek } = gameTime;
  return `${formatDate(year, month, day)} ${getDayOfWeekName(dayOfWeek)} ${formatTime(hour, minute)}`;
};

// 获取场景图片根据当前时间
export const getSceneImageByTime = (scene, gameTime) => {
  if (!scene) return '';

  const period = getTimePeriod(gameTime.hour);
  const sceneImages = scene.sceneImages || {};

  // 优先使用对应时间段的图片
  switch (period) {
    case TIME_PERIODS.MORNING:
      if (sceneImages.morning) return sceneImages.morning;
      break;
    case TIME_PERIODS.NOON:
      if (sceneImages.noon) return sceneImages.noon;
      break;
    case TIME_PERIODS.EVENING:
      if (sceneImages.evening) return sceneImages.evening;
      break;
    case TIME_PERIODS.NIGHT:
      if (sceneImages.night) return sceneImages.night;
      break;
  }

  // 如果没有对应时间段的图片，使用默认图片
  return scene.imageUrl || '';
};

// 生成时间影响的提示词（用于AI生成对话）
export const getTimeInfluencePrompt = (gameTime) => {
  const period = getTimePeriod(gameTime.hour);
  const periodName = getTimePeriodName(period);

  let prompt = `当前游戏时间：${formatFullDateTime(gameTime)}，${periodName}。\n`;
  prompt += `请根据当前时间调整角色的对话内容和行为方式：\n`;

  switch (period) {
    case TIME_PERIODS.MORNING:
      prompt += `- 早晨：角色可能刚起床，精神状态慢慢恢复，对话可以带有清晨的感觉。\n`;
      prompt += `- 可以提到吃早餐、晨练、开始新的一天等话题。\n`;
      break;
    case TIME_PERIODS.NOON:
      prompt += `- 中午：角色可能在吃午饭、休息或进行日常活动。\n`;
      prompt += `- 可以提到午餐、午休、工作等话题。\n`;
      break;
    case TIME_PERIODS.EVENING:
      prompt += `- 傍晚：角色可能在准备晚餐、散步或享受休闲时光。\n`;
      prompt += `- 可以提到日落、晚餐、放松等话题。\n`;
      break;
    case TIME_PERIODS.NIGHT:
      prompt += `- 晚上：角色可能准备睡觉、进行夜间活动或休息。\n`;
      prompt += `- 可以提到晚餐后、星空、睡眠、夜间活动等话题。\n`;
      prompt += `- 角色可能显得更疲惫或更放松。\n`;
      break;
  }

  return prompt;
};

// 格式化游戏时间用于记忆存储
export const formatGameTimeForMemory = (gameTime) => {
  return {
    year: gameTime.year,
    month: gameTime.month,
    day: gameTime.day,
    hour: gameTime.hour,
    minute: gameTime.minute,
    dayOfWeek: gameTime.dayOfWeek,
    formatted: formatFullDateTime(gameTime)
  };
};
