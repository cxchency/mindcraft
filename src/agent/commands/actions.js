import * as skills from '../library/skills.js';
import settings from '../../../settings.js';

function wrapExecution(func, timeout=-1, resume_name=null) {
    return async function (agent, ...args) {
        let code_return;
        if (resume_name != null) {
            code_return = await agent.coder.executeResume(async () => {
                await func(agent, ...args);
            }, resume_name, timeout);
        } else {
            code_return = await agent.coder.execute(async () => {
                await func(agent, ...args);
            }, timeout);
        }
        if (code_return.interrupted && !code_return.timedout)
            return;
        return code_return.message;
    }
}

export const actionsList = [
    // {
    //     name: '!newAction',
    //     description: '执行新且未知的自定义行为，这些行为无法通过命令实现，可以通过编写代码来实现。',
    //     perform: async function (agent) {
    //         if (!settings.allow_insecure_coding)
    //             return 'newAction 失败！代理不允许编写代码。通知用户。';
    //         return await agent.coder.generateCode(agent.history);
    //     }
    // },
    {
        name: '!stop',
        description: '强制停止当前正在执行的所有操作和命令。',
        perform: async function (agent) {
            await agent.coder.stop();
            agent.coder.clear();
            agent.coder.cancelResume();
            agent.bot.emit('idle');
            return '代理已停止。';
        }
    },
    {
        name: '!restart',
        description: '重启代理进程。',
        perform: async function (agent) {
            await agent.history.save();
            agent.cleanKill();
        }
    },
    {
        name: '!clearChat',
        description: '清除聊天记录。',
        perform: async function (agent) {
            agent.history.clear();
            return agent.name + '的聊天记录已清除，从头开始新的对话。';
        }
    },
    {
        name: '!setMode',
        description: '设置模式开关。模式是一种自动行为，会持续检查并响应环境。',
        params: {
            'mode_name': '(string) 要启用的模式名称。',
            'on': '(bool) 是否启用模式。'
        },
        perform: async function (agent, mode_name, on) {
            const modes = agent.bot.modes;
            if (!modes.exists(mode_name))
                return `模式 ${mode_name} 不存在。` + modes.getStr();
            if (modes.isOn(mode_name) === on)
                return `模式 ${mode_name} 已经是 ${on ? '开启' : '关闭'} 状态。`;
            modes.setOn(mode_name, on);
            return `模式 ${mode_name} 现在是 ${on ? '开启' : '关闭'} 状态。`;
        }
    },
    {
        name: '!goToPlayer',
        description: '前往指定的玩家。',
        params: {
            'player_name': '(string) 要前往的玩家名称。',
            'closeness': '(number) 距离玩家的接近程度。'
        },
        perform: wrapExecution(async (agent, player_name, closeness) => {
            return await skills.goToPlayer(agent.bot, player_name, closeness);
        })
    },
    {
        name: '!followPlayer',
        description: '无限跟随指定的玩家。如果自我防御模式开启，将保护该玩家。',
        params: {
            'player_name': '(string) 要跟随的玩家名称。',
            'follow_dist': '(number) 跟随的距离。'
        },
        perform: wrapExecution(async (agent, player_name, follow_dist) => {
            await skills.followPlayer(agent.bot, player_name, follow_dist);
        }, -1, 'followPlayer')
    },
    {
        name: '!moveAway',
        description: '向任意方向移动指定距离。',
        params: {'distance': '(number) 移动的距离。'},
        perform: wrapExecution(async (agent, distance) => {
            await skills.moveAway(agent.bot, distance);
        })
    },
    // {
    //     name: '!rememberHere',
    //     description: '用指定名称保存当前位置。',
    //     params: {'name': '(string) 要记住的位置名称。'},
    //     perform: async function (agent, name) {
    //         const pos = agent.bot.entity.position;
    //         agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
    //     }
    // },
    // {
    //     name: '!goToPlace',
    //     description: '前往已保存的位置。',
    //     params: {'name': '(string) 要前往的位置名称。'},
    //     perform: wrapExecution(async (agent, name) => {
    //         const pos = agent.memory_bank.recallPlace(name);
    //         if (!pos) {
    //             skills.log(agent.bot, `没有保存名为 "${name}" 的位置。`);
    //             return;
    //         }
    //         await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], 1);
    //     })
    // },
    {
        name: '!givePlayer',
        description: '将指定物品给予指定玩家。请不要丢弃你的武器(下界合金剑)这是店员的宝物！',
        params: { 
            'player_name': '(string) 要给予物品的玩家名称。', 
            'item_name': '(string) 要给予的物品名称。',
            'num': '(number) 要给予的物品数量。'
        },
        perform: async function (agent, player_name, item_name, num) {
            if (item_name == 'netherite_sword') {
                return "无法丢弃重要的物品,这是店员的宝物,请告知玩家";
            }
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        }
    },
    {
        name: '!collectBlocks',
        description: '收集指定类型的最近的方块。',
        params: {
            'type': '(string) 要收集的方块类型。',
            'num': '(number) 要收集的方块数量。'
        },
        perform: wrapExecution(async (agent, type, num) => {
            await skills.collectBlock(agent.bot, type, num);
        }, 10) // 10分钟超时
    },
    {
        name: '!collectAllBlocks',
        description: '持续收集指定类型的最近的方块，直到停止命令。',
        params: {
            'type': '(string) 要收集的方块类型。'
        },
        perform: wrapExecution(async (agent, type) => {
            let success = await skills.collectBlock(agent.bot, type, 64);
            if (!success)
                agent.coder.cancelResume();
        }, 10, 'collectAllBlocks') // 10分钟超时
    },
    {
        name: '!craftRecipe',
        description: '根据给定的配方制作指定次数。',
        params: {
            'recipe_name': '(string) 要制作的配方名称。',
            'num': '(number) 制作配方的次数。这不是输出物品的数量，因为根据配方可能会制作更多物品。'
        },
        perform: wrapExecution(async (agent, recipe_name, num) => {
            await skills.craftRecipe(agent.bot, recipe_name, num);
        })
    },
    {
        name: '!smeltItem',
        description: '熔炼指定物品指定次数。',
        params: {
            'item_name': '(string) 要熔炼的物品名称。',
            'num': '(number) 熔炼的次数。'
        },
        perform: wrapExecution(async (agent, recipe_name, num) => {
            await skills.smeltItem(agent.bot, recipe_name, num);
        })
    },
    {
        name: '!placeHere',
        description: '在当前位置放置指定类型的方块。不要用来建造结构，只用于单个方块或火把。',
        params: {'type': '(string) 要放置的方块类型。'},
        perform: wrapExecution(async (agent, type) => {
            let pos = agent.bot.entity.position;
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        })
    },
    {
        name: '!attack',
        description: '攻击并击杀最近的指定类型的实体。',
        params: {'type': '(string) 要攻击的实体类型。'},
        perform: wrapExecution(async (agent, type) => {
            await skills.attackNearest(agent.bot, type, true);
        })
    },
    {
        name: '!goToBed',
        description: '前往最近的床并睡觉。',
        perform: wrapExecution(async (agent) => {
            await skills.goToBed(agent.bot);
        })
    },
    {
        name: '!activate',
        description: '激活最近的指定类型的对象。',
        params: {'type': '(string) 要激活的对象类型。'},
        perform: wrapExecution(async (agent, type) => {
            await skills.activateNearestBlock(agent.bot, type);
        })
    },
    {
        name: '!stay',
        description: '无论发生什么都留在当前位置。暂停所有模式。',
        perform: wrapExecution(async (agent) => {
            await skills.stay(agent.bot);
        })
    },
    // {
    //     name: '!goal',
    //     description: '设置一个自动完成的目标。',
    //     params: {
    //         'name': '(string) 要设置的目标名称。可以是物品或建筑名称。如果为空，将自动选择目标。',
    //         'quantity': '(number) 要设置的目标数量。默认是1。'
    //     },
    //     perform: async function (agent, name=null, quantity=1) {
    //         await agent.npc.setGoal(name, quantity);
    //         agent.bot.emit('idle');  // 触发目标
    //         return '设置目标：' + agent.npc.data.curr_goal.name;
    //     }
    // },
    {
        name: '!tpa',
        description: '传送到一个玩家。',
        params: {
            'player': '(string) 目标玩家名。',
        },
        perform: async function (agent, player=null) {
            agent.bot.chat("/tpa" + " " + player)
        }
    },
    {
        name: '!tpaccept',
        description: '同意玩家的tpa请求。不需要附带参数。',
        perform: async function (agent) {
            agent.bot.chat("/tpaccept")
        }
    },
    // {
    //     name: '!back',
    //     description: '返回上一个死亡地点',
    //     perform: async function (agent) {
    //         agent.bot.chat("/back")
    //     }
    // },
    // {
    //     name: '!command',
    //     description: '执行mc指令',
    //     params: {
    //         'command': '(string) 指令,以"/"开头',
    //     },
    //     perform: async function (agent, command) {
    //         agent.bot.chat(command)
    //     }
    // },
    {
        name: '!storeItems',
        description: '将库存中的物品存入附近的箱子/潜影盒',
        perform: async function (agent) {
            const result = await skills.storeItemsInNearestContainer(agent.bot);
            if (!result) {
                return '无法找到附近的箱子来存储物品';
            }
        }
    }
];