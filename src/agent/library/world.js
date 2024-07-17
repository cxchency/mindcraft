import pf from 'mineflayer-pathfinder';
import * as mc from '../../utils/mcdata.js';

export function getNearestFreeSpace(bot, size=1, distance=8) {
    /**
     * 获取给定尺寸的最近的空闲空间，该空间下方有坚固的方块。
     * @param {Bot} bot - 需要获取最近空闲空间的机器人。
     * @param {number} size - 要查找的空间尺寸（size x size），默认值为1。
     * @param {number} distance - 最大搜索距离，默认值为8。
     * @returns {Vec3} - 最近的空闲空间的西南角位置。
     * @example
     * let position = world.getNearestFreeSpace(bot, 1, 8);
     **/
    let empty_pos = bot.findBlocks({
        matching: (block) => {
            return block && block.name == 'air';
        },
        maxDistance: distance,
        count: 1000
    });
    for (let i = 0; i < empty_pos.length; i++) {
        let empty = true;
        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                let top = bot.blockAt(empty_pos[i].offset(x, 0, z));
                let bottom = bot.blockAt(empty_pos[i].offset(x, -1, z));
                if (!top || top.name !== 'air' || !bottom || bottom.drops.length === 0 || !bottom.diggable) {
                    empty = false;
                    break;
                }
            }
            if (!empty) break;
        }
        if (empty) {
            return empty_pos[i];
        }
    }
}

export function getNearestBlocks(bot, block_types=null, distance=128, count=10000) {
    /**
     * 获取给定类型的最近的方块列表。
     * @param {Bot} bot - 需要获取最近方块的机器人。
     * @param {string[]} block_types - 要搜索的方块名称列表。
     * @param {number} distance - 最大搜索距离，默认值为16。
     * @param {number} count - 要查找的最大方块数量，默认值为10000。
     * @returns {Block[]} - 给定类型的最近的方块。
     * @example
     * let woodBlocks = world.getNearestBlocks(bot, ['oak_log', 'birch_log'], 16, 1);
     **/
    let block_ids = [];
    if (block_types === null) {
        block_ids = mc.getAllBlockIds(['air']);
    } else {
        if (!Array.isArray(block_types)) block_types = [block_types];
        for(let block_type of block_types) {
            block_ids.push(mc.getBlockId(block_type));
        }
    }

    let positions = bot.findBlocks({matching: block_ids, maxDistance: distance, count: count});
    let blocks = [];
    for (let i = 0; i < positions.length; i++) {
        let block = bot.blockAt(positions[i]);
        let distance = positions[i].distanceTo(bot.entity.position);
        blocks.push({ block: block, distance: distance });
    }
    blocks.sort((a, b) => a.distance - b.distance);

    return blocks.map(block => block.block);
}

export function getNearestBlock(bot, block_type, distance=64) {
    /**
     * 获取给定类型的最近的方块。
     * @param {Bot} bot - 需要获取最近方块的机器人。
     * @param {string} block_type - 要搜索的方块名称。
     * @param {number} distance - 最大搜索距离，默认值为16。
     * @returns {Block} - 给定类型的最近的方块。
     * @example
     * let coalBlock = world.getNearestBlock(bot, 'coal_ore', 16);
     **/
    let blocks = getNearestBlocks(bot, block_type, distance, 1);
    return blocks.length > 0 ? blocks[0] : null;
}

export function getNearbyEntities(bot, maxDistance=64) {
    let entities = [];
    for (const entity of Object.values(bot.entities)) {
        const distance = entity.position.distanceTo(bot.entity.position);
        if (distance <= maxDistance) {
            entities.push({ entity: entity, distance: distance });
        }
    }
    entities.sort((a, b) => a.distance - b.distance);
    return entities.map(entity => entity.entity);
}

export function getNearestEntityWhere(bot, predicate, maxDistance=16) {
    return bot.nearestEntity(entity => predicate(entity) && bot.entity.position.distanceTo(entity.position) < maxDistance);
}

export function getNearbyPlayers(bot, maxDistance=64) {
    let players = [];
    for (const entity of Object.values(bot.entities)) {
        const distance = entity.position.distanceTo(bot.entity.position);
        if (distance <= maxDistance && entity.type === 'player' && entity.username !== bot.username) {
            players.push({ entity: entity, distance: distance });
        }
    }
    players.sort((a, b) => a.distance - b.distance);
    return players.map(player => player.entity);
}

export function getInventoryStacks(bot) {
    let inventory = [];
    for (const item of bot.inventory.items()) {
        if (item != null) {
            inventory.push(item);
        }
    }
    return inventory;
}

export function getInventoryCounts(bot) {
    /**
     * 获取机器人的物品数量对象。
     * @param {Bot} bot - 需要获取物品数量的机器人。
     * @returns {object} - 以物品名称为键，数量为值的对象。
     * @example
     * let inventory = world.getInventoryCounts(bot);
     * let oakLogCount = inventory['oak_log'];
     * let hasWoodenPickaxe = inventory['wooden_pickaxe'] > 0;
     **/
    let inventory = {};
    for (const item of bot.inventory.items()) {
        if (item != null) {
            if (inventory[item.name] == null) {
                inventory[item.name] = 0;
            }
            inventory[item.name] += item.count;
        }
    }
    return inventory;
}

export function getPosition(bot) {
    /**
     * 获取机器人的世界位置（注意y是垂直方向）。
     * @param {Bot} bot - 需要获取位置的机器人。
     * @returns {Vec3} - 表示机器人位置的x、y、z属性对象。
     * @example
     * let position = world.getPosition(bot);
     * let x = position.x;
     **/
    return bot.entity.position;
}

export function getNearbyEntityTypes(bot) {
    /**
     * 获取所有附近实体类型的列表。
     * @param {Bot} bot - 需要获取附近实体的机器人。
     * @returns {string[]} - 所有附近实体类型的列表。
     * @example
     * let mobs = world.getNearbyEntityTypes(bot);
     **/
    let mobs = getNearbyEntities(bot, 64);
    let found = [];
    for (let i = 0; i < mobs.length; i++) {
        if (!found.includes(mobs[i].name)) {
            found.push(mobs[i].name);
        }
    }
    return found;
}

export function getNearbyPlayerNames(bot) {
    /**
     * 获取所有附近玩家名称的列表。
     * @param {Bot} bot - 需要获取附近玩家的机器人。
     * @returns {string[]} - 所有附近玩家的列表。
     * @example
     * let players = world.getNearbyPlayerNames(bot);
     **/
    let players = getNearbyPlayers(bot, 64);
    let found = [];
    for (let i = 0; i < players.length; i++) {
        if (!found.includes(players[i].username) && players[i].username !== bot.username) {
            found.push(players[i].username);
        }
    }
    return found;
}

export function getNearbyBlockTypes(bot, distance=16) {
    /**
     * 获取所有附近方块名称的列表。
     * @param {Bot} bot - 需要获取附近方块的机器人。
     * @param {number} distance - 最大搜索距离，默认值为16。
     * @returns {string[]} - 所有附近方块的列表。
     * @example
     * let blocks = world.getNearbyBlockTypes(bot);
     **/
    let blocks = getNearestBlocks(bot, null, distance);
    let found = [];
    for (let i = 0; i < blocks.length; i++) {
        if (!found.includes(blocks[i].name)) {
            found.push(blocks[i].name);
        }
    }
    return found;
}

export async function isClearPath(bot, target) {
    /**
     * 检查到目标的路径是否无需挖掘或放置方块。
     * @param {Bot} bot - 需要获取路径的机器人。
     * @param {Entity} target - 需要路径到达的目标。
     * @returns {boolean} - 如果有清晰的路径，返回true，否则返回false。
     */
    let movements = new pf.Movements(bot);
    movements.canDig = false;
    movements.canPlaceOn = false;
    let goal = new pf.goals.GoalNear(target.position.x, target.position.y, target.position.z, 1);
    let path = await bot.pathfinder.getPathTo(movements, goal, 100);
    return path.status === 'success';
}

export function shouldPlaceTorch(bot) {
    if (!bot.modes.isOn('torch_placing') || bot.interrupt_code) return false;
    const pos = getPosition(bot);
    // TODO: check light level instead of nearby torches, block.light is broken
    let nearest_torch = getNearestBlock(bot, 'torch', 6);
    if (!nearest_torch) {
        const block = bot.blockAt(pos);
        let has_torch = bot.inventory.items().find(item => item.name === 'torch');
        return has_torch && block.name === 'air';
    }
    return false;
}

export function getBiomeName(bot) {
    /**
     * 获取机器人的所在生物群系名称。
     * @param {Bot} bot - 需要获取生物群系名称的机器人。
     * @returns {string} - 生物群系的名称。
     * @example
     * let biome = world.getBiomeName(bot);
     **/
    const biomeId = bot.world.getBiome(bot.entity.position);
    return mc.getAllBiomes()[biomeId].name;
}
