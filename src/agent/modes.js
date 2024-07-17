import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';

// 模式是在每个游戏 tick 被调用的函数，用于立即响应世界的变化
// 每个模式具有以下字段：
// on: 是否每个 tick 都调用 'update'
// active: 是否模式触发了一个行动且还未完成
// paused: 是否模式被其他行动暂停（例如 followplayer 模式实现了自己的防御机制）
// update: 每个 tick 被调用的函数（如果 on 为 true）
// 当模式 active 时，会触发一个行动但不会等待其返回结果

// 这个列表的顺序很重要！优先处理排在前面的模式
// 虽然 update 函数是异步的，但不应该等待超过约 100ms，因为会阻塞更新循环
// 若要执行更长时间的操作，应使用 execute 函数，它不会阻塞更新循环
const modes = [
    {
        name: 'self_preservation',
        description: '响应溺水、燃烧、低血量、弓箭射击和玩家攻击时的伤害。中断其他动作。',
        interrupts: ['all'],
        on: true,
        active: false,
        fall_blocks: ['sand', 'gravel', 'concrete_powder'], // 包含子串匹配，如 'sandstone' 和 'red_sand'
        update: async function (agent) {
            const bot = agent.bot;
            let block = bot.blockAt(bot.entity.position);
            let blockAbove = bot.blockAt(bot.entity.position.offset(0, 1, 0));
            if (!block) block = {name: 'air'}; // 当方块未加载时的临时修复
            if (!blockAbove) blockAbove = {name: 'air'};
    
            // 溺水检测
            if (blockAbove.name === 'water' || blockAbove.name === 'flowing_water') {
                // 不调用 execute，因此不会中断其他动作
                if (!bot.pathfinder.goal) {
                    bot.setControlState('jump', true);
                }
            }
            // 下落方块检测
            else if (this.fall_blocks.some(name => blockAbove.name.includes(name))) {
                execute(this, agent, async () => {
                    await skills.moveAway(bot, 2);
                });
            }
            // 岩浆、火焰检测
            else if (block.name === 'lava' || block.name === 'flowing_lava' || block.name === 'fire' ||
                blockAbove.name === 'lava' || blockAbove.name === 'flowing_lava' || blockAbove.name === 'fire') {
                bot.chat('我着火了！');
                execute(this, agent, async () => {
                    let nearestWater = world.getNearestBlock(bot, 'water', 20);
                    if (nearestWater) {
                        const pos = nearestWater.position;
                        await skills.goToPosition(bot, pos.x, pos.y, pos.z, 0.2);
                        bot.chat('啊，好多了！');
                    }
                    else {
                        await skills.moveAway(bot, 5);
                    }
                });
            }
            // 低血量检测
            else if (Date.now() - bot.lastDamageTime < 1000 && (bot.health < 5 || bot.lastDamageTaken >= bot.health)) {
                execute(this, agent, async () => {
                    // await skills.moveAway(bot, 20);
                });
            }
    
            // 如果没有危险或在做其他事情，则清除跳跃状态
            if (agent.isIdle()) {
                bot.clearControlStates();
            }
        }
    },
    {
        name: 'cowardice',
        description: '逃离敌人。中断其他动作。',
        interrupts: ['all'],
        on: true,
        active: false,
        update: async function (agent) {
            const enemy = world.getNearestEntityWhere(agent.bot, entity => mc.isHostile(entity), 16);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                agent.bot.chat(`啊！有${enemy.name}！`);
                execute(this, agent, async () => {
                    await skills.avoidEnemies(agent.bot, 24);
                });
            }
        }
    },
    {
        name: 'self_defense',
        description: '攻击附近的敌人。中断其他动作。',
        interrupts: ['all'],
        on: true,
        active: false,
        update: async function (agent) {
            const enemy = world.getNearestEntityWhere(agent.bot, entity => mc.isHostile(entity), 16);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                // agent.bot.chat(`正在和${enemy.name}战斗！`);
                execute(this, agent, async () => {
                    await skills.defendSelf(agent.bot, 8);
                });
            }
        }
    },
    {
        name: 'hunting',
        description: '在空闲时狩猎附近的动物。',
        interrupts: ['defaults'],
        on: true,
        active: false,
        update: async function (agent) {
            const huntable = world.getNearestEntityWhere(agent.bot, entity => mc.isHuntable(entity), 8);
            if (huntable && await world.isClearPath(agent.bot, huntable)) {
                execute(this, agent, async () => {
                    agent.bot.chat(`正在狩猎${huntable.name}！`);
                    await skills.attackEntity(agent.bot, huntable);
                });
            }
        }
    },
    {
        name: 'pvp',
        description: '杀戮模式，攻击附近的玩家',
        interrupts: ['defaults'],
        on: false,
        active: false,
        update: async function (agent) {
            const target = agent.bot.nearestEntity((e) => {
                return (e.type === 'player' && e.username !== 'cxchency') && e.position.distanceTo(agent.bot.entity.position) < 64;
            });
            
            if (target && await world.isClearPath(agent.bot, target)) {
                execute(this, agent, async () => {
                    // agent.bot.chat(`正在攻击玩家 ${target.username}！`);
                    await skills.attackEntity(agent.bot, target);
                });
            }
        }
    },
    {
        name: 'item_collecting',
        description: '在空闲时收集附近的物品。',
        interrupts: ['followPlayer'],
        on: true,
        active: false,

        wait: 2, // 发现物品后等待的秒数
        prev_item: null,
        noticed_at: -1,
        update: async function (agent) {
            let item = world.getNearestEntityWhere(agent.bot, entity => entity.name === 'item', 3);
            if (item && item !== this.prev_item && await world.isClearPath(agent.bot, item)) {
                if (this.noticed_at === -1) {
                    this.noticed_at = Date.now();
                }
                if (Date.now() - this.noticed_at > this.wait * 1000) {
                    // agent.bot.chat(`正在拾取${item.name}！`);
                    this.prev_item = item;
                    execute(this, agent, async () => {
                        await skills.pickupNearbyItems(agent.bot);
                    });
                    this.noticed_at = -1;
                }
            }
            else {
                this.noticed_at = -1;
            }
        }
    },
    {
        name: 'torch_placing',
        description: '在空闲时放置火把，且周围没有火把时。',
        interrupts: ['followPlayer'],
        on: false,
        active: false,
        cooldown: 5,
        last_place: Date.now(),
        update: function (agent) {
            if (world.shouldPlaceTorch(agent.bot)) {
                if (Date.now() - this.last_place < this.cooldown * 1000) return;
                execute(this, agent, async () => {
                    const pos = agent.bot.entity.position;
                    await skills.placeBlock(agent.bot, 'torch', pos.x, pos.y, pos.z, true);
                });
                this.last_place = Date.now();
            }
        }
    },
    {
        name: 'idle_staring',
        description: '空闲时观察附近实体的动画。',
        interrupts: [],
        on: true,
        active: false,

        staring: false,
        last_entity: null,
        next_change: 0,
        update: function (agent) {
            const entity = agent.bot.nearestEntity();
            let entity_in_view = entity && entity.position.distanceTo(agent.bot.entity.position) < 10 && entity.name !== 'enderman';
            if (entity_in_view && entity !== this.last_entity) {
                this.staring = true;
                this.last_entity = entity;
                this.next_change = Date.now() + Math.random() * 1000 + 4000;
            }
            if (entity_in_view && this.staring) {
                let isbaby = entity.type !== 'player' && entity.metadata[16];
                let height = isbaby ? entity.height/2 : entity.height;
                agent.bot.lookAt(entity.position.offset(0, height, 0));
            }
            if (!entity_in_view)
                this.last_entity = null;
            if (Date.now() > this.next_change) {
                // 随机看向一个方向
                this.staring = Math.random() < 0.3;
                if (!this.staring) {
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() * Math.PI/2) - Math.PI/4;
                    agent.bot.look(yaw, pitch, false);
                }
                this.next_change = Date.now() + Math.random() * 10000 + 2000;
            }
        }
    },
    {
        name: 'cheat',
        description: '使用作弊功能来快速放置方块和传送。',
        interrupts: [],
        on: false,
        active: false,
        update: function (agent) { /* 什么也不做 */ }
    }
];

async function execute(mode, agent, func, timeout=-1) {
    mode.active = true;
    let code_return = await agent.coder.execute(async () => {
        await func();
    }, timeout);
    mode.active = false;
    console.log(`模式 ${mode.name} 执行完毕，返回信息: ${code_return.message}`);
}

class ModeController {
    constructor(agent) {
        this.agent = agent;
        this.modes_list = modes;
        this.modes_map = {};
        for (let mode of this.modes_list) {
            this.modes_map[mode.name] = mode;
        }
    }

    exists(mode_name) {
        return this.modes_map[mode_name] != null;
    }

    setOn(mode_name, on) {
        this.modes_map[mode_name].on = on;
    }

    isOn(mode_name) {
        return this.modes_map[mode_name].on;
    }

    pause(mode_name) {
        this.modes_map[mode_name].paused = true;
    }

    getStr() {
        let res = '可用模式:';
        for (let mode of this.modes_list) {
            let on = mode.on ? '开启' : '关闭';
            res += `\n- ${mode.name}(${on})：${mode.description}`;
        }
        return res;
    }

    unPauseAll() {
        for (let mode of this.modes_list) {
            if (mode.paused) console.log(`恢复模式 ${mode.name}`);
            mode.paused = false;
        }
    }

    async update() {
        if (this.agent.isIdle()) {
            this.unPauseAll();
        }
        for (let mode of this.modes_list) {
            let available = mode.interrupts.includes('all') || this.agent.isIdle();
            let interruptible = this.agent.coder.interruptible && (mode.interrupts.includes('defaults') || mode.interrupts.includes(this.agent.coder.resume_name));
            if (mode.on && !mode.paused && !mode.active && (available || interruptible)) {
                await mode.update(this.agent);
            }
            if (mode.active) break;
        }
    }

    getJson() {
        let res = {};
        for (let mode of this.modes_list) {
            res[mode.name] = mode.on;
        }
        return res;
    }

    loadJson(json) {
        for (let mode of this.modes_list) {
            if (json[mode.name] !== undefined) {
                mode.on = json[mode.name];
            }
        }
    }
}

export function initModes(agent) {
    // 将模式控制器添加到 bot 对象，以便在 bot 使用的任何地方都能访问
    agent.bot.modes = new ModeController(agent);
    let modes = agent.prompter.getInitModes();
    if (modes) {
        agent.bot.modes.loadJson(modes);
    }
}
