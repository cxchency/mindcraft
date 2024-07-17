import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';


const pad = (str) => {
    return '\n' + str + '\n';
}

// queries are commands that just return strings and don't affect anything in the world
export const queryList = [
    {
        name: "!stats",
        description: "获取机器人的位置、健康值、饥饿值和时间。",
        perform: function (agent) {
            let bot = agent.bot;
            let res = '状态';
            let pos = bot.entity.position;
            // 显示保留两位小数的位置
            res += `\n- 位置: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`;
            res += `\n- 游戏模式: ${bot.game.gameMode}`;
            res += `\n- 健康值: ${Math.round(bot.health)} / 20`;
            res += `\n- 饥饿值: ${Math.round(bot.food)} / 20`;
            res += `\n- 生物群系: ${world.getBiomeName(bot)}`;
            let weather = "晴天";
            if (bot.rainState > 0)
                weather = "雨天";
            if (bot.thunderState > 0)
                weather = "雷暴";
            res += `\n- 天气: ${weather}`;
            // let block = bot.blockAt(pos);
            // res += `\n- 人造光: ${block.skyLight}`;
            // res += `\n- 天空光: ${block.light}`;
            // 光照属性有问题，不准确

            if (bot.time.timeOfDay < 6000) {
                res += '\n- 时间: 早晨';
            } else if (bot.time.timeOfDay < 12000) {
                res += '\n- 时间: 下午';
            } else {
                res += '\n- 时间: 晚上';
            }

            let other_players = world.getNearbyPlayerNames(bot);
            if (other_players.length > 0) {
                res += '\n- 其他玩家: ' + other_players.join(', ');
            }
            return pad(res);
        }
    },
    {
        name: "!inventory",
        description: "获取机器人的库存。",
        perform: function (agent) {
            let bot = agent.bot;
            let inventory = world.getInventoryCounts(bot);
            let res = '库存';
            for (const item in inventory) {
                if (inventory[item] && inventory[item] > 0)
                    res += `\n- ${item}: ${inventory[item]}`;
            }
            if (res === '库存') {
                res += ': 无';
            }
            else if (agent.bot.game.gameMode === 'creative') {
                res += '\n(你在创造模式中有无限物品)';
            }
            return pad(res);
        }
    },
    {
        name: "!nearbyBlocks",
        description: "获取机器人附近的方块。",
        perform: function (agent) {
            let bot = agent.bot;
            let res = '附近的方块';
            let blocks = world.getNearbyBlockTypes(bot);
            for (let i = 0; i < blocks.length; i++) {
                res += `\n- ${blocks[i]}`;
            }
            if (blocks.length == 0) {
                res += ': 无';
            }
            return pad(res);
        }
    },
    {
        name: "!craftable",
        description: "根据机器人的库存获取可制作的物品。",
        perform: function (agent) {
            const bot = agent.bot;
            const table = world.getNearestBlock(bot, 'crafting_table');
            let res = '可制作的物品';
            for (const item of mc.getAllItems()) {
                let recipes = bot.recipesFor(item.id, null, 1, table);
                if (recipes.length > 0) {
                    res += `\n- ${item.name}`;
                }
            }
            if (res == '可制作的物品') {
                res += ': 无';
            }
            return pad(res);
        }
    },
    {
        name: "!entities",
        description: "获取附近的玩家和实体。",
        perform: function (agent) {
            let bot = agent.bot;
            let res = '附近的实体';
            for (const entity of world.getNearbyPlayerNames(bot)) {
                res += `\n- 玩家: ${entity}`;
            }
            for (const entity of world.getNearbyEntityTypes(bot)) {
                res += `\n- 生物: ${entity}`;
            }
            if (res == '附近的实体') {
                res += ': 无';
            }
            return pad(res);
        }
    },
    {
        name: "!modes",
        description: "获取所有可用模式并查看其开/关状态。",
        perform: function (agent) {
            return agent.bot.modes.getStr();
        }
    },
    // {
    //     name: '!savedPlaces',
    //     description: '列出所有已保存的位置。',
    //     perform: async function (agent) {
    //         return "已保存的位置名称: " + agent.memory_bank.getKeys();
    //     }
    // }
];
