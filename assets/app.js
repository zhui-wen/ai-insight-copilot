/* ============================================================
 * 新能源 AI 洞察助手  InsightCopilot
 * 纯原生 JS，零依赖；模型调用走 OpenAI 兼容接口
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */
  const LS_CONFIG = 'nai_config_v1';
  const LS_HISTORY = 'nai_history_v1';
  const LS_INPUT = 'nai_input_draft';

  const PRESETS = [
    { id: 'deepseek', name: 'DeepSeek（推荐）', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'qwen', name: '通义千问 · 百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { id: 'moonshot', name: 'Kimi · 月之暗面', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
  ];

  const MODE_NAME = { brief: '行业简报', minutes: '会议纪要', tender: '招标要点' };

  /* ---------------- 提示词模板 ---------------- */
  const BASE_SYSTEM = [
    '你是一名新能源行业（光伏 / 储能 / 虚拟电厂 / 综合能源管理）的业务运营分析师，直接向公司 CEO 办公室汇报。',
    '读者是一线业务负责人和 CEO，他们没有时间读长文，需要的是「能拍板、能转发、能落地」的材料。',
    '',
    '写作准则：',
    '1. 只使用素材中出现的信息，禁止编造数据、政策条款、人名、公司名。',
    '2. 素材没有的关键信息，写「素材未提及」或「待确认」，不要用常识脑补填补。',
    '3. 严格区分素材事实与个人推断，推断内容须标注「（推断）」。',
    '4. 结论先行：每节第一句就是结论，后面才是支撑。',
    '5. 用词克制，不用「赋能、抓手、生态闭环」这类空话；行动项动词开头、可执行。',
    '6. 数字保留原始表述与单位（MW、MWh、元/kWh、%），不擅自换算或取整。',
    '7. 只输出 Markdown 正文，不要开场白、不要结语、不要「以下是」。'
  ].join('\n');

  const TEMPLATES = {
    brief: (industry, verbosity) => [
      `任务：把下面的素材整理成一份可直接呈报 CEO 的结构化行业简报。行业方向：${industry}。`,
      `详细程度：${verbosity}（简洁＝每节 1-3 条、表格不超过 5 行；标准＝3-5 条；详细＝每节展开并补充推演）。`,
      '',
      '严格按以下结构输出，标题文字不要修改：',
      '',
      '## 一、一句话结论',
      '（不超过 60 字，说清「这条信息对公司意味着什么」）',
      '',
      '## 二、核心事实',
      '（3-5 条，每条一句话；关键数字保留原文表述）',
      '',
      '## 三、关键信息表',
      '| 事件 / 政策 | 相关主体 | 时间 | 对业务的影响 | 影响程度 |',
      '| --- | --- | --- | --- | --- |',
      '',
      '## 四、机会与风险',
      '**机会**（2-3 条，落到公司可切入的具体业务动作）',
      '',
      '**风险**（2-3 条，含不确定性、合规与竞争风险）',
      '',
      '## 五、可执行行动项',
      '| 行动项 | 建议责任团队 | 建议完成时间 | 优先级 |',
      '| --- | --- | --- | --- |',
      '',
      '## 六、待核实信息',
      '（列出素材缺失、表述含糊或需外部确认的点，至少 2 条）'
    ].join('\n'),

    minutes: (industry, verbosity) => [
      `任务：把下面的会议记录 / 录音转写整理成规范的会议纪要，供 CEO 和跨部门负责人直接传阅。行业方向：${industry}。`,
      `详细程度：${verbosity}。`,
      '',
      '要求：客观陈述，不臆测未讨论内容；人名与岗位无法确认时写「待补充」，不要编造。',
      '行动项必须能落到人：素材中没有责任人时写「待指派」，并单独列进待确认区。',
      '',
      '严格按以下结构输出：',
      '',
      '## 一、会议信息',
      '（时间 / 地点或形式 / 主持 / 参会方 / 议题；缺失项写「待补充」）',
      '',
      '## 二、核心结论',
      '（3-5 条，每条一句话，按重要性排序）',
      '',
      '## 三、决议事项',
      '| 序号 | 决议内容 | 决策依据 |',
      '| --- | --- | --- |',
      '',
      '## 四、行动项',
      '| 事项 | 责任人 | 协作方 | 截止时间 | 交付物 | 状态 |',
      '| --- | --- | --- | --- | --- | --- |',
      '',
      '## 五、风险与阻塞',
      '（影响项目推进的问题，含责任归属不清、资源缺口、外部依赖）',
      '',
      '## 六、待确认问题',
      '（会上没定、需要下次会议或单独沟通确认的开放问题）'
    ].join('\n'),

    tender: (industry, verbosity) => [
      `任务：从下面的招标 / 采购公告中提取投标要点，输出给商务与售前团队的作战清单。行业方向：${industry}。`,
      `详细程度：${verbosity}。`,
      '',
      '要求：条款类信息逐条摘录原文关键表述，不要概括成模糊说法；素材没写的资质、评分项不要猜测。',
      '凡是可能导致废标的硬性条款，必须在风险提示里单独点名。',
      '',
      '严格按以下结构输出：',
      '',
      '## 一、项目概要',
      '（项目名称 / 招标人 / 预算金额 / 标段划分 / 项目地点 / 招标方式）',
      '',
      '## 二、时间节点',
      '| 事项 | 时间 | 备注 |',
      '| --- | --- | --- |',
      '（含报名、答疑、投标截止、开标）',
      '',
      '## 三、资格与资质门槛',
      '| 要求 | 原文关键表述 | 我方满足情况 |',
      '| --- | --- | --- |',
      '（满足 / 不满足 / 待确认）',
      '',
      '## 四、技术参数与交付要求',
      '（关键指标、验收标准、偏离风险）',
      '',
      '## 五、商务条款',
      '（付款方式、质保期、履约保证金、违约罚则、联合体或分包限制）',
      '',
      '## 六、评分办法与得分要点',
      '（技术分 / 商务分 / 价格分构成，以及可主动争取的加分项）',
      '',
      '## 七、风险提示',
      '（废标风险、硬性条款、表述歧义、明显不利条款）',
      '',
      '## 八、投标动作清单',
      '| 动作 | 责任方 | 建议截止日 | 优先级 |',
      '| --- | --- | --- | --- |'
    ].join('\n')
  };

  /* ---------------- 示例素材（虚构，仅演示） ---------------- */
  const SAMPLES = {
    brief: `【示例素材 · 内容为演示虚构，非真实文件】

关于推动虚拟电厂参与电力市场交易的通知（征求意见稿）摘要

一、市场准入
支持虚拟电厂以独立主体身份参与日前现货市场、辅助服务市场交易。参与交易的虚拟电厂聚合资源总容量不低于 5 MW，且应具备 15 分钟级功率可调能力。

二、价格与补偿
需求响应补偿标准上限由现行 3 元/千瓦时调整为 4 元/千瓦时，单个聚合商年度调用次数原则上不超过 20 次。参与辅助服务市场的调频容量补偿按现行规则执行。

三、数据与平台
聚合商应按 1 分钟粒度向省级虚拟电厂管理平台上传运行数据，包括实时功率、可调容量、响应执行率等。2027 年 1 月 1 日起，未完成平台接入的聚合资源不再享受需求响应补偿。

四、其他
本通知自印发之日起施行，有效期三年。各地市可结合本地电力供需情况制定实施细则。`,

    minutes: `【示例素材 · 内容为演示虚构，非真实文件】

2026 年 10 月 14 日 综合能源事业部周例会（录音转写，未经校对）

罗总：今天过三件事。第一，XX 园区 EMS 项目下周三截止投标，标书还差技术方案和实施计划。李工你那边技术参数对完了吗？
李工：主体功能对完了，但招标文件要求支持 15 分钟级数据上传，我们现在平台是小时级，要改接口，大概要五天。
罗总：五天太慢了。能不能先按现有版本投，承诺交付后三个月内升级？
王珊：这样有风险，评分表里"技术响应完整性"占 15 分，写偏离可能会扣分。
罗总：那你今天下班前把评分表逐条拉一遍，看偏离到底扣多少分，明天上午给我结论。李工同步评估改造工作量和报价。
李工：好。另外上周说的储能变流器供应商还没定，商务那边一直没回。
罗总：这个我来推，本周五之前定。
王珊：还有客户那边希望我们下周去现场讲一次方案，时间要跟投标截止错开。
罗总：那就定周四下午，王珊你排一下，顺便把上次竞品的那份材料整理进去。`,

    tender: `【示例素材 · 内容为演示虚构，非真实文件】

XX 工业园区综合能源管理平台（EMS）采购项目公开招标公告

招标编号：XXNY-2026-0731
招标人：XX 工业园区开发建设有限公司
招标代理：XX 工程咨询有限公司
预算金额：人民币 486 万元（含税），最高限价 486 万元，超过最高限价的投标将被否决。
项目地点：XX 市 XX 工业园区

一、招标范围
园区综合能源管理平台软件 1 套，含能源数据采集、储能 EMS 调度、负荷预测、能效分析、可视化大屏；配套边缘网关 42 台，以及 3 年运维服务。

二、投标人资格要求
1. 具有独立法人资格，注册资本不低于 1000 万元；
2. 具备电力工程施工总承包三级及以上资质，或电子与智能化工程专业承包二级及以上资质；
3. 近三年（2023 年 1 月 1 日至今）具有至少 2 个合同金额 300 万元以上的综合能源或储能 EMS 项目业绩，须提供合同关键页及验收证明；
4. 项目经理须具备机电工程专业二级及以上注册建造师资格，且未担任其他在建项目负责人；
5. 本项目不接受联合体投标。

三、时间安排
报名及获取招标文件：2026 年 10 月 12 日至 10 月 18 日 17:00
答疑截止：2026 年 10 月 20 日 12:00
投标文件递交截止及开标：2026 年 11 月 3 日 9:30
投标保证金：人民币 8 万元，须于 10 月 30 日 16:00 前到账

四、技术要求（摘录）
1. 平台须支持不少于 5000 个测点的数据接入，数据刷新周期不大于 1 分钟；
2. 储能 EMS 须支持 SOC 均衡、峰谷套利、需量控制三种策略，策略切换响应时间小于 3 秒；
3. 负荷预测模块须提供未来 96 点（15 分钟粒度）预测曲线，日前预测准确率不低于 92%；
4. 系统须通过等保二级测评，并提供测评报告；
5. 交付工期：合同签订后 90 日历天内完成上线试运行。

五、商务条款
付款方式：合同签订后预付 20%，到货验收付 30%，上线试运行付 30%，终验合格付 15%，质保金 5%，质保期 3 年。
逾期交货违约金：每逾期 1 日按合同总额 0.5% 计取，累计不超过 10%。

六、评标办法
综合评分法，总分 100 分：技术分 45 分（方案完整性 20 分、类似业绩 15 分、团队配置 10 分），商务分 15 分，价格分 40 分（低价优先法）。`
  };

  /* ---------------- 示例结果（离线演示用） ---------------- */
  const DEMO = {
    brief: `## 一、一句话结论
虚拟电厂从"示范"进入"可结算"阶段，公司应在 2027 年前完成平台接入并锁定工商业可调资源，否则将失去补偿资格。

## 二、核心事实
1. 虚拟电厂可作为独立主体参与日前现货与辅助服务市场，聚合资源总容量不低于 5 MW。
2. 需求响应补偿上限由 3 元/kWh 提高至 4 元/kWh，单个聚合商年度调用不超过 20 次。
3. 聚合资源须具备 15 分钟级功率可调能力，并按 1 分钟粒度上传运行数据。
4. 2027 年 1 月 1 日起，未接入省级平台的资源不再享受需求响应补偿。
5. 文件仍为征求意见稿，有效期拟定为三年。

## 三、关键信息表
| 事件 / 政策 | 相关主体 | 时间 | 对业务的影响 | 影响程度 |
| --- | --- | --- | --- | --- |
| 虚拟电厂获独立市场主体身份 | 省发改委 / 电网公司 | 2026-10 | 聚合业务具备稳定收益模型，可对外报价 | 高 |
| 补偿上限提至 4 元/kWh | 省级电力交易中心 | 2026-10 | 单项目年收益上限抬升，回收期缩短 | 高 |
| 1 分钟数据上传与可调能力要求 | 聚合商 | 2027-01 起 | 现有 EMS 需改造数据接口与采集精度 | 中 |
| 逾期未接入取消补偿 | 存量聚合资源 | 2027-01 | 已签约客户存在流失与索赔风险 | 高 |

## 四、机会与风险
**机会**
1. 用新的 4 元/kWh 补偿上限重算在谈园区的投资回收期，作为商务谈判的核心论据。
2. 把"省级平台接入 + 1 分钟数据上传"打包成标准交付模块，形成可复用的投标亮点。
3. 面向存量聚合资源推"接入改造 + 代运营"服务，承接 2027 年前的改造窗口。

**风险**
1. 补偿标准提高将吸引更多聚合商入场，优质可调资源的签约成本上升（推断）。
2. 15 分钟级可调对存量硬件有硬性要求，客户追加投资意愿不足时转化率会下降。
3. 文件为征求意见稿，补偿标准与年限仍可能调整，收益测算不宜对外承诺。

## 五、可执行行动项
| 行动项 | 建议责任团队 | 建议完成时间 | 优先级 |
| --- | --- | --- | --- |
| 按 4 元/kWh 重算 3 个在谈园区项目的 IRR 与回收期 | 商务 + 售前 | 本周内 | 高 |
| 梳理存量项目数据接口改造清单与报价 | 研发 + 交付 | 2 周内 | 高 |
| 输出一页纸政策解读，供客户拜访使用 | 市场 | 3 个工作日内 | 中 |
| 确认省级平台接入流程、资质与验收标准 | 政府事务 | 待确认 | 中 |

## 六、待核实信息
1. 5 MW 是单点接入容量还是聚合后总容量，口径待确认。
2. 4 元/kWh 是否分季节、分时段执行，素材未提及。
3. 2027 年接入的申报窗口与验收标准未说明。
4. 辅助服务市场调频补偿的具体单价素材未给出。`,

    minutes: `## 一、会议信息
- 时间：2026 年 10 月 14 日
- 形式：综合能源事业部周例会（地点待补充）
- 主持：罗总
- 参会方：李工（技术）、王珊（商务 / 售前）
- 议题：XX 园区 EMS 项目投标准备、储能变流器供应商定标、客户现场方案汇报

## 二、核心结论
1. XX 园区 EMS 项目下周三截止投标，技术方案与实施计划尚未定稿。
2. 平台当前为小时级数据上传，不满足招标要求的 15 分钟级，接口改造需 5 天。
3. 是否以"技术偏离 + 承诺后续升级"方式投标，需先核算评分表扣分影响后再定。
4. 储能变流器供应商由罗总本人在本周五前推动定标。
5. 客户现场方案汇报定在周四下午，需与投标截止时间错开。

## 三、决议事项
| 序号 | 决议内容 | 决策依据 |
| --- | --- | --- |
| 1 | 暂不直接确定投标方案，先做评分影响测算 | 技术响应完整性占 15 分，偏离存在扣分风险 |
| 2 | 供应商定标由罗总本周五前推动完成 | 商务侧迟迟未反馈，影响投标报价 |
| 3 | 客户现场汇报定周四下午 | 需与下周三投标截止错开 |

## 四、行动项
| 事项 | 责任人 | 协作方 | 截止时间 | 交付物 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 逐条核对评分表，测算技术偏离扣分 | 王珊 | — | 10 月 14 日下班前 | 扣分测算说明 | 进行中 |
| 评估 15 分钟级接口改造工作量与报价 | 李工 | 研发 | 10 月 15 日上午 | 改造方案 + 报价 | 待启动 |
| 推动储能变流器供应商定标 | 罗总 | 商务 | 10 月 16 日 | 定标结论 | 待启动 |
| 组织客户现场方案汇报，并入竞品分析材料 | 王珊 | 售前 | 10 月 15 日（周四下午） | 汇报材料 | 待启动 |

## 五、风险与阻塞
1. 接口改造需 5 天，与投标截止时间冲突，若不改则技术分存在扣分风险。
2. 储能变流器供应商未定，直接影响报价与交付周期，是当前最大阻塞项。
3. 竞品材料尚未整理，现场汇报的说服力可能不足。

## 六、待确认问题
1. 技术偏离的具体扣分分值，待王珊测算后确认。
2. 若承诺"交付后三个月内升级"，是否需在投标文件中出具承诺函，未明确。
3. 客户现场汇报的参会层级与决策人是否到场，待确认。`,

    tender: `## 一、项目概要
| 项目 | 内容 |
| --- | --- |
| 项目名称 | XX 工业园区综合能源管理平台（EMS）采购项目 |
| 招标编号 | XXNY-2026-0731 |
| 招标人 | XX 工业园区开发建设有限公司 |
| 预算 / 最高限价 | 486 万元（含税），超限价即否决 |
| 招标范围 | 平台软件 1 套 + 边缘网关 42 台 + 3 年运维 |
| 项目地点 | XX 市 XX 工业园区 |
| 招标方式 | 公开招标，不接受联合体 |

## 二、时间节点
| 事项 | 时间 | 备注 |
| --- | --- | --- |
| 报名及获取文件 | 10 月 12 日 — 10 月 18 日 17:00 | 已临近截止 |
| 答疑截止 | 10 月 20 日 12:00 | 歧义条款须在此前提出 |
| 保证金到账 | 10 月 30 日 16:00 前 | 8 万元 |
| 投标截止 / 开标 | 11 月 3 日 9:30 | 同日开标 |

## 三、资格与资质门槛
| 要求 | 原文关键表述 | 我方满足情况 |
| --- | --- | --- |
| 注册资本 | 不低于 1000 万元 | 待确认 |
| 施工 / 智能化资质 | 电力工程施工总承包三级及以上，或电子与智能化专包二级及以上 | 待确认 |
| 类似业绩 | 近三年 2 个 300 万元以上综合能源或储能 EMS 项目，须合同关键页 + 验收证明 | 待确认（关键项） |
| 项目经理 | 机电工程二级及以上注册建造师，且无其他在建项目 | 待确认 |
| 联合体 | 不接受联合体投标 | 需独立满足全部资质 |

## 四、技术参数与交付要求
1. 测点接入不少于 5000 个，数据刷新周期 ≤ 1 分钟（现有平台为小时级，需改造）。
2. 储能 EMS 支持 SOC 均衡、峰谷套利、需量控制三种策略，切换响应 < 3 秒。
3. 负荷预测提供 96 点（15 分钟粒度）曲线，日前准确率 ≥ 92%。
4. 须通过等保二级测评并提供报告。
5. 交付工期：合同签订后 90 日历天内上线试运行。

## 五、商务条款
- 付款节奏：预付 20% / 到货验收 30% / 试运行 30% / 终验 15% / 质保金 5%
- 质保期：3 年
- 逾期违约金：每日 0.5%，累计上限 10%
- 投标保证金：8 万元
- 不接受联合体，不允许分包（素材未提及分包条款，需在答疑中确认）

## 六、评分办法与得分要点
总分 100 分：技术 45 分（方案完整性 20、类似业绩 15、团队配置 10）、商务 15 分、价格 40 分（低价优先）。
- 得分关键在价格（40 分）与业绩（15 分），技术方案偏离将直接损失方案完整性分数。
- 建议在答疑阶段确认"业绩金额口径"是否可按合同含税总额计算，争取业绩分。

## 七、风险提示
1. **废标风险**：超最高限价直接否决；保证金逾期到账视为无效投标。
2. **业绩门槛**：2 个 300 万元以上同类项目为硬性条件，不满足则无法通过资格审查。
3. **资质与建造师**：需同时具备施工或智能化资质，且项目经理不得有在建项目，须提前核查。
4. **工期风险**：90 日历天内完成 5000 测点接入与等保测评，时间偏紧。
5. **条款歧义**：分包限制、验收标准细则未明确，应在 10 月 20 日答疑前书面提出。

## 八、投标动作清单
| 动作 | 责任方 | 建议截止日 | 优先级 |
| --- | --- | --- | --- |
| 核查资质、业绩、建造师是否满足硬性门槛 | 商务 | 10 月 18 日 | 高 |
| 提交答疑问题清单（分包、业绩口径、验收标准） | 售前 | 10 月 19 日 | 高 |
| 完成 1 分钟数据上传接口改造方案与报价 | 研发 | 10 月 24 日 | 高 |
| 编制技术方案与项目实施计划 | 售前 | 10 月 28 日 | 高 |
| 缴纳投标保证金 8 万元 | 财务 | 10 月 30 日 16:00 前 | 高 |
| 投标文件内部评审与盖章封装 | 商务 | 11 月 1 日 | 中 |`
  };

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    modes: $('modes'),
    input: $('input'),
    industry: $('industry'),
    verbosity: $('verbosity'),
    charCount: $('charCount'),
    btnGenerate: $('btnGenerate'),
    genLabel: $('genLabel'),
    btnSample: $('btnSample'),
    btnClearInput: $('btnClearInput'),
    output: $('output'),
    outTag: $('outTag'),
    status: $('status'),
    metrics: $('metrics'),
    btnCopy: $('btnCopy'),
    btnExport: $('btnExport'),
    promptView: $('promptView'),
    history: $('history'),
    btnClearHistory: $('btnClearHistory'),
    modelChip: $('modelChip'),
    modal: $('modal'),
    preset: $('preset'),
    baseUrl: $('baseUrl'),
    apiKey: $('apiKey'),
    modelName: $('modelName'),
    btnTest: $('btnTest'),
    btnSaveCfg: $('btnSaveCfg'),
    testResult: $('testResult'),
    toast: $('toast')
  };

  /* ---------------- 状态 ---------------- */
  const state = {
    mode: 'brief',
    running: false,
    controller: null,
    raw: '',
    startedAt: 0
  };

  /* ---------------- 工具 ---------------- */
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { els.toast.hidden = true; }, 2200);
  }

  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function load(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) { return def; }
  }

  function getConfig() {
    return load(LS_CONFIG, { baseUrl: '', apiKey: '', model: '' });
  }

  function wordCount(str) {
    // 中文按字计，英文按单词计
    const cn = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
    const en = (str.match(/[a-zA-Z]+/g) || []).length;
    return cn + en;
  }

  /* ============================================================
   * Markdown 渲染（轻量、无依赖，支持标题/表格/列表/引用/代码）
   * ============================================================ */
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inline(s) {
    let t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }

  const isSep = (l) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.indexOf('-') > -1;
  const isList = (l) => /^\s*([-*+]|\d+\.)\s+/.test(l);

  function splitRow(line) {
    let t = line.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|')) t = t.slice(0, -1);
    return t.split('|').map((c) => c.trim());
  }

  function renderMarkdown(src) {
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) { i++; continue; }

      // 代码块
      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><code data-lang="' + esc(lang) + '">' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // 标题
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push('<' + 'h' + h[1].length + '>' + inline(h[2]) + '</' + 'h' + h[1].length + '>'); i++; continue; }

      // 分隔线
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      // 引用
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + renderMarkdown(buf.join('\n')) + '</blockquote>');
        continue;
      }

      // 表格
      if (line.indexOf('|') > -1 && i + 1 < lines.length && isSep(lines[i + 1])) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].indexOf('|') > -1 && lines[i].trim()) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        let t = '<div class="tbl"><table><thead><tr>' +
          head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
        t += rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('');
        t += '</tbody></table></div>';
        out.push(t);
        continue;
      }

      // 列表
      if (isList(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const items = [];
        while (i < lines.length && isList(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''));
          i++;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.map((x) => '<li>' + inline(x) + '</li>').join('') + '</' + tag + '>');
        continue;
      }

      // 段落
      const buf = [];
      while (
        i < lines.length && lines[i].trim() &&
        !/^(#{1,6}\s|```|>)/.test(lines[i]) &&
        !isList(lines[i]) &&
        !(lines[i].indexOf('|') > -1 && i + 1 < lines.length && isSep(lines[i + 1]))
      ) {
        buf.push(lines[i]);
        i++;
      }
      if (buf.length) out.push('<p>' + inline(buf.join('\n')).replace(/\n/g, '<br>') + '</p>');
      else i++;
    }
    return out.join('\n');
  }

  /* ============================================================
   * 渲染与状态
   * ============================================================ */
  function paint(md, streaming) {
    const nearBottom =
      els.output.scrollHeight - els.output.scrollTop - els.output.clientHeight < 90;

    els.output.innerHTML = renderMarkdown(md) ||
      '<div class="empty"><p>生成中…</p></div>';

    if (streaming) {
      const last = els.output.lastElementChild;
      if (last) last.classList.add('cursor');
      else els.output.insertAdjacentHTML('beforeend', '<p class="cursor"></p>');
    }
    if (nearBottom || streaming) els.output.scrollTop = els.output.scrollHeight;
  }

  function setStatus(text, ok) {
    els.status.textContent = text;
    els.status.className = ok ? 'ok' : '';
  }

  function setRunning(on) {
    state.running = on;
    els.btnGenerate.classList.toggle('stopping', on);
    els.genLabel.textContent = on ? '停止生成' : '生成分析结果';
    els.btnGenerate.disabled = false;
  }

  function updateMetrics(md) {
    if (!state.startedAt) return;
    const sec = ((Date.now() - state.startedAt) / 1000).toFixed(1);
    els.metrics.textContent =
      '输出 ' + wordCount(md) + ' 字 · 耗时 ' + sec + ' 秒 · 模型 ' +
      (getConfig().model || '示例');
  }

  function updateChip() {
    const c = getConfig();
    if (c.apiKey && c.model) {
      els.modelChip.textContent = '模型 · ' + c.model;
      els.modelChip.classList.remove('off');
    } else {
      els.modelChip.textContent = '未配置模型（示例模式）';
      els.modelChip.classList.add('off');
    }
    els.modelChip.title = c.baseUrl || '';
  }

  function updatePromptView() {
    const tpl = TEMPLATES[state.mode](els.industry.value, els.verbosity.value);
    els.promptView.textContent = '【System】\n' + BASE_SYSTEM + '\n\n【User】\n' + tpl +
      '\n\n【素材】\n（用户粘贴的内容）';
  }

  /* ============================================================
   * 模型调用
   * ============================================================ */
  async function streamChat(messages, onDelta, signal) {
    const cfg = getConfig();
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: messages,
        temperature: 0.3,
        stream: true
      }),
      signal: signal
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch (e) {}
      throw new Error('HTTP ' + res.status + ' ' + detail);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    let full = '';

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop();

      for (const raw of parts) {
        const line = raw.trim();
        if (!line || line.indexOf('data:') !== 0) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices && json.choices[0] && json.choices[0].delta;
          const text = delta && (delta.content || '');
          if (text) { full += text; onDelta(full); }
        } catch (e) { /* 忽略非 JSON 心跳 */ }
      }
    }
    return full;
  }

  /* 示例流式输出：不调用模型，用于无 Key 演示 */
  function streamDemo(text, onDelta, signal) {
    return new Promise((resolve, reject) => {
      let idx = 0;
      const step = () => {
        if (signal && signal.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
        idx = Math.min(text.length, idx + 12 + Math.floor(Math.random() * 14));
        onDelta(text.slice(0, idx));
        if (idx >= text.length) { resolve(text); return; }
        setTimeout(step, 28);
      };
      step();
    });
  }

  /* ============================================================
   * 生成主流程
   * ============================================================ */
  async function generate() {
    if (state.running) { stopGenerate(); return; }

    const content = els.input.value.trim();
    if (content.length < 30) {
      toast('素材太短了，至少粘贴 30 字');
      els.input.focus();
      return;
    }

    const cfg = getConfig();
    const useDemo = !(cfg.apiKey && cfg.model && cfg.baseUrl);

    state.startedAt = Date.now();
    state.raw = '';
    state.controller = new AbortController();
    setRunning(true);
    els.outTag.textContent = MODE_NAME[state.mode];
    setStatus(useDemo ? '示例模式生成中…' : '模型生成中…');
    els.metrics.textContent = '';
    paint('## 生成中…\n正在' + MODE_NAME[state.mode] + '，请稍候。', true);

    const userPrompt = TEMPLATES[state.mode](els.industry.value, els.verbosity.value) +
      '\n\n===== 素材开始 =====\n' + content + '\n===== 素材结束 =====';

    let result = '';
    try {
      if (useDemo) {
        await streamDemo(DEMO[state.mode], (full) => {
          state.raw = full;
          paint(full, true);
        }, state.controller.signal);
        result = DEMO[state.mode];
        toast('未配置 API Key，展示内置示例结果');
      } else {
        result = await streamChat(
          [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: userPrompt }],
          (full) => { state.raw = full; paint(full, true); },
          state.controller.signal
        );
      }

      state.raw = result;
      paint(result, false);
      setStatus('已完成', true);
      updateMetrics(result);
      saveHistory(result);
    } catch (err) {
      paint(state.raw, false);
      if (err && err.name === 'AbortError') {
        setStatus('已停止');
        updateMetrics(state.raw);
        if (state.raw) saveHistory(state.raw);
      } else {
        setStatus('调用失败');
        els.output.insertAdjacentHTML('beforeend',
          '<hr><p><strong>调用失败：</strong>' + esc(String(err && err.message || err)) + '</p>' +
          '<p style="font-size:12px;color:#7b8c85">排查建议：① Key / Base URL / 模型名是否填写正确；' +
          '② 若提示跨域或 Failed to fetch，请在项目目录执行 <code>python -m http.server 8000</code> 后访问 http://localhost:8000；' +
          '③ 也可先用「示例模式」演示。</p>');
      }
    } finally {
      setRunning(false);
      state.controller = null;
    }
  }

  function stopGenerate() {
    if (state.controller) state.controller.abort();
    setRunning(false);
  }

  /* ============================================================
   * 历史记录
   * ============================================================ */
  function saveHistory(md) {
    if (!state.raw.trim()) return;
    const list = load(LS_HISTORY, []);
    const firstLine = (md.split('\n').find((l) => l.trim() && !/^[#|\-]/.test(l)) || '').replace(/[*_`]/g, '');
    list.unshift({
      id: Date.now(),
      mode: state.mode,
      industry: els.industry.value,
      title: firstLine.slice(0, 36) || MODE_NAME[state.mode],
      input: els.input.value.slice(0, 4000),
      output: md,
      ts: Date.now()
    });
    store(LS_HISTORY, list.slice(0, 12));
    renderHistory();
  }

  function renderHistory() {
    const list = load(LS_HISTORY, []);
    if (!list.length) {
      els.history.innerHTML = '<p class="history-empty">暂无记录。生成的结果会自动保存在本机浏览器。</p>';
      return;
    }
    els.history.innerHTML = '';
    list.forEach((it) => {
      const btn = document.createElement('button');
      btn.className = 'hitem';
      const d = new Date(it.ts);
      const time = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const b = document.createElement('b');
      b.textContent = it.title;
      const s = document.createElement('small');
      s.textContent = MODE_NAME[it.mode] + ' · ' + it.industry + ' · ' + time;
      btn.appendChild(b);
      btn.appendChild(s);
      btn.addEventListener('click', () => {
        els.input.value = it.input;
        els.industry.value = it.industry;
        setMode(it.mode);
        onInputChange();
        paint(it.output, false);
        els.outTag.textContent = MODE_NAME[it.mode];
        state.raw = it.output;
        setStatus('已载入历史记录');
        updateMetrics(it.output);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      els.history.appendChild(btn);
    });
  }

  /* ============================================================
   * 交互绑定
   * ============================================================ */
  function setMode(mode) {
    state.mode = mode;
    Array.prototype.forEach.call(els.modes.children, (b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    els.outTag.textContent = MODE_NAME[mode];
    updatePromptView();
  }

  function onInputChange() {
    const len = els.input.value.length;
    els.charCount.textContent = wordCount(els.input.value) + ' 字';
    els.charCount.style.color = len > 0 && len < 100 ? '#b45309' : '';
    store(LS_INPUT, els.input.value);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制到剪贴板');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('已复制到剪贴板'); }
      catch (e2) { toast('复制失败，请手动选择文本'); }
      document.body.removeChild(ta);
    }
  }

  function exportMd() {
    if (!state.raw.trim()) { toast('还没有可导出的内容'); return; }
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
    const name = MODE_NAME[state.mode] + '_' + els.industry.value + '_' + stamp + '.md';
    const blob = new Blob([state.raw], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    toast('已导出 ' + name);
  }

  /* ---------------- 设置弹窗 ---------------- */
  function openModal() {
    const cfg = getConfig();
    els.baseUrl.value = cfg.baseUrl || '';
    els.apiKey.value = cfg.apiKey || '';
    els.modelName.value = cfg.model || '';
    els.testResult.textContent = '';
    els.testResult.className = 'test-result';
    els.modal.hidden = false;
    els.preset.innerHTML = '<option value="">— 自定义 —</option>' +
      PRESETS.map((p) => '<option value="' + p.id + '">' + p.name + '</option>').join('');
  }

  function closeModal() { els.modal.hidden = true; }

  function saveConfig() {
    store(LS_CONFIG, {
      baseUrl: els.baseUrl.value.trim(),
      apiKey: els.apiKey.value.trim(),
      model: els.modelName.value.trim()
    });
    updateChip();
    closeModal();
    toast('设置已保存到本机');
  }

  async function testConnection() {
    const cfg = {
      baseUrl: els.baseUrl.value.trim(),
      apiKey: els.apiKey.value.trim(),
      model: els.modelName.value.trim()
    };
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
      els.testResult.textContent = '三项都填完才能测试';
      els.testResult.className = 'test-result err';
      return;
    }
    els.testResult.textContent = '测试中…';
    els.testResult.className = 'test-result';
    try {
      const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: '回复两个字：可用' }],
          max_tokens: 8,
          stream: false
        })
      });
      if (!res.ok) {
        const t = (await res.text()).slice(0, 160);
        throw new Error('HTTP ' + res.status + ' · ' + t);
      }
      els.testResult.textContent = '✓ 连接成功，可以开始使用';
      els.testResult.className = 'test-result ok';
    } catch (err) {
      els.testResult.textContent = '✕ ' + (err.message || '连接失败') +
        '（若为跨域错误，请用本地 http 服务打开本页）';
      els.testResult.className = 'test-result err';
    }
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    // 模式切换
    els.modes.addEventListener('click', (e) => {
      const btn = e.target.closest('.mode');
      if (btn) setMode(btn.dataset.mode);
    });

    els.input.addEventListener('input', onInputChange);
    els.industry.addEventListener('change', updatePromptView);
    els.verbosity.addEventListener('change', updatePromptView);

    els.btnGenerate.addEventListener('click', generate);
    els.btnCopy.addEventListener('click', () => copyText(state.raw));
    els.btnExport.addEventListener('click', exportMd);

    // 粘进链接时提示
    els.input.addEventListener('paste', () => {
      setTimeout(() => {
        const v = els.input.value.trim();
        if (/^https?:\/\/\S+$/.test(v)) {
          toast('检测到链接，请改为粘贴网页正文（浏览器无法直接抓取外部网页）');
        }
      }, 60);
    });

    els.btnSample.addEventListener('click', () => {
      els.input.value = SAMPLES[state.mode];
      els.industry.value = '虚拟电厂';
      onInputChange();
      updatePromptView();
      toast('已载入示例素材（虚构，仅供演示）');
    });

    els.btnClearInput.addEventListener('click', () => {
      els.input.value = '';
      onInputChange();
      els.input.focus();
    });

    // 设置
    $('btnSettings').addEventListener('click', openModal);
    document.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', closeModal));
    els.btnSaveCfg.addEventListener('click', saveConfig);
    els.btnTest.addEventListener('click', testConnection);
    els.preset.addEventListener('change', () => {
      const p = PRESETS.find((x) => x.id === els.preset.value);
      if (p) {
        els.baseUrl.value = p.baseUrl;
        els.modelName.value = p.model;
      }
    });

    els.btnClearHistory.addEventListener('click', () => {
      if (!confirm('确定清空本机所有历史记录？')) return;
      store(LS_HISTORY, []);
      renderHistory();
      toast('历史已清空');
    });

    // 快捷键
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generate();
      }
      if (e.key === 'Escape') closeModal();
    });

    // 恢复草稿
    const draft = load(LS_INPUT, '');
    if (draft) els.input.value = draft;

    updateChip();
    onInputChange();
    setMode('brief');
    renderHistory();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
