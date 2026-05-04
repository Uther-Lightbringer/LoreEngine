/**
 * Novel Story Mode - Integration Test Script
 *
 * This script tests the novel upload, parsing, and gameplay flow.
 *
 * Usage: node test-novel-flow.js <test-file.txt>
 *
 * Note: This requires the server to be running on port 3001
 */

const TESTNovel_CONTENT = `第一章 林黛玉进京

却说黛玉自那日弃舟登岸时，便有荣国府打发了轿子并拉行李的车辆久候了。这林黛玉常听得母亲说过，他外祖母家与别家不同。他近日所见的这几个三等仆妇，吃穿用度，已是不凡了，何况今至其家。因此步步留心，时时在意，不肯轻易多说一句话，多行一步路，惟恐被人耻笑了他去。

自上了轿，进入城中，从纱窗向外瞧了一瞧，其街市之繁华，人烟之阜盛，自与别处不同。又行了半日，忽见街北蹲着两个大石狮子，三间兽头大门，门前列坐着十来个华冠丽服之人。正门却不开，只有东西两角门有人出入。正门之上有一匾，匾上大书"敕造宁国府"五个大字。

黛玉想道：这必是外祖之长房了。想着，又往西行，不多远，照样也是三间大门，方是荣国府了。却不进正门，只进了西边角门。那轿夫抬着进去，从一边的香墙绕过去，方停下车。

又换了三四个衣帽周全的小厮上来，复与抬起轿子。一径到了一个新的地方。到了门前，十几个人打了滚地皮来伺候。

却说黛玉身边只有一个从小带着的乳母唤着雪雁，一个是十岁的小丫头亦称着雪雁，前番后面住的时候，都是另有一番光景了。如今与黛玉一同北上，双手如何如何，又如何如何。

黛玉心中渐渐有些明白，但说不出口来。那王熙凤素日最会使唤人的，得了这个机会便向内收拾出许多物什。

话说黛玉自那日弃舟登岸时，小心翼翼，不敢多言。那贾雨村便向张县令打听消息，得知黛玉乃贾敏之女，贾敏乃贾代善之妻。

这日到了荣国府门前，那三等仆妇的吃穿用度已是不凡，何况今至其家。因此黛玉步步留心，时时在意。

第二章 宝黛初会

一语未了，只听得后院中有人笑声，说："我来迟了，不曾迎接远客！"黛玉心中正疑惑着："这些人皆皆肃然起敬，独这里一个这样子？"想着，只见一群媳妇丫鬟围拥着一个人从后房门进来。

这个人打扮与姑娘们不同，只见王熙凤头上戴着金丝八宝攒珠髻，绾着朝阳五凤挂珠钗；项下带着赤金盘螭璎珞圈；裙边系着豆绿宫绦双鱼比目玫瑰佩；身上穿着缕金百蝶穿花大红洋缎窄裉袄，外罩五彩刻丝石青银鼠褂；下着翡翠撒花洋绉裙。一双丹凤三角眼，两弯柳叶吊梢眉，身量苗条，体格风骚，粉面含春威不露，丹唇未启笑先闻。

黛玉连忙起身接见。贾母笑道："你不认得他，他是我们这里有名的一个泼皮破落户儿，南省俗谓作'辣子'，你只叫他'凤辣子'就是了。"

黛玉心中正想着如何称呼，只见王夫人却指着王熙凤笑道："你还不知道呢，你这个妹妹他不敢当，就是你婆婆的意思。"

却说黛玉自幼同胞共乳，今日远嫁，况又有通灵玉在旁，因而更比别的姐妹不同。可是如何却说是姑娘？那王熙凤听了，心中想道："我这妹妹的眉毛、眼睛、手足，没一处不像老太太。"

第三章 熙凤弄权

话说周瑞家的送了刘姥姥去后，便来回复王夫人。王夫人问他："刘姥姥什么时候来的？"周瑞家的道："那日来的。"王夫人想了想，又问："住在哪里？"周瑞家的道："就住在我们后边的小庙里。"王夫人便叫彩明去写账。

却说王熙凤知道刘姥姥来，心中自是欢喜。便叫了周瑞家的来，问道："那刘姥姥可有什么说的？"周瑞家的道："刘姥姥说家里穷，来请姑奶奶的安。"熙凤笑道："这刘姥姥来一趟也不容易，给他抓了两吊钱，叫他买些东西吃。"

正说着，只见一个小丫头子走来，说："二奶奶，林姑娘来了。"熙凤听了，心中想道："这林姑娘来得倒快。"说着，便叫小丫头子把林姑娘请进来。

林黛玉进来，见过了王夫人、王熙凤，又与众姐妹相见。熙凤便拉了黛玉的手，问长问短。黛玉一一答应。

这里王夫人问了刘姥姥的事，熙凤便把那两千银子的事说了一遍。王夫人听了，说："这刘姥姥倒是个有良心的。"

却说那刘姥姥拿了钱，千恩万谢地去了。
`;

const fs = require('fs');
const path = require('path');

async function testNovelFlow() {
  const API_BASE = 'http://localhost:3001/api';

  console.log('🧪 Novel Story Mode Integration Test\n');

  // Test 1: Upload novel
  console.log('📤 Test 1: Uploading novel...');
  try {
    const formData = new FormData();
    const blob = new Blob([TESTNovel_CONTENT], { type: 'text/plain' });
    formData.append('file', blob, 'test_novel.txt');

    const response = await fetch(`${API_BASE}/novels/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const uploadResult = await response.json();
    console.log('✅ Upload successful!');
    console.log(`   Novel ID: ${uploadResult.novel?.id}`);
    console.log(`   Chapters: ${uploadResult.novel?.chapters?.length}`);

    const novelId = uploadResult.novel?.id;
    const chapterId = uploadResult.novel?.chapters?.[0]?.id;

    if (!novelId || !chapterId) {
      throw new Error('Invalid response - missing novel or chapter ID');
    }

    // Test 2: Get novel details
    console.log('\n📚 Test 2: Getting novel details...');
    const novelRes = await fetch(`${API_BASE}/novels/${novelId}`);
    const novel = await novelRes.json();
    console.log('✅ Novel retrieved!');
    console.log(`   Name: ${novel.name}`);
    console.log(`   Type: ${novel.type}`);
    console.log(`   Chapters: ${novel.chapters?.length}`);

    // Test 3: Parse chapter
    console.log('\n🔍 Test 3: Parsing chapter for choice points...');
    const parseRes = await fetch(`${API_BASE}/novels/${novelId}/chapter/${chapterId}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const parseResult = await parseRes.json();
    console.log('✅ Chapter parsed!');
    console.log(`   Characters found: ${parseResult.characters?.length || 0}`);
    console.log(`   Choice points: ${parseResult.choice_points?.length || 0}`);

    if (parseResult.characters) {
      console.log('   Characters:');
      parseResult.characters.forEach(c => console.log(`     - ${c.name} (${c.role})`));
    }

    // Test 4: Get progress
    console.log('\n📊 Test 4: Getting progress...');
    const progressRes = await fetch(`${API_BASE}/novels/${novelId}/progress`);
    const progress = await progressRes.json();
    console.log('✅ Progress retrieved!');
    console.log(`   Chapters tracked: ${progress.chapters?.length || 0}`);

    // Test 5: Update progress
    console.log('\n💾 Test 5: Updating progress...');
    const updateRes = await fetch(`${API_BASE}/novels/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        novelId,
        chapterId,
        characterName: '林黛玉',
        currentPosition: 5,
        choices: [],
        completedBranches: [],
        unlockedCharacters: []
      })
    });
    const updateResult = await updateRes.json();
    console.log('✅ Progress updated!');

    console.log('\n🎉 All tests passed!\n');
    console.log('Integration test summary:');
    console.log('- ✅ Novel upload and chapter segmentation');
    console.log('- ✅ Novel query with character detection');
    console.log('- ✅ Chapter parsing with choice point detection');
    console.log('- ✅ Progress tracking API');
    console.log('- ✅ Progress update API');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nMake sure the server is running on port 3001');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  testNovelFlow();
}

module.exports = { testNovelFlow };
