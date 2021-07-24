import { updateNodeElement } from "../DOM"
import {
  createTaskQueue,
  createStateNode,
  getTag,
} from "../Misc"

const getRoot = instance => {
  let fiber = instance.__fiber
  while (fiber.parent) {
    fiber = fiber.parent
  }
  return fiber
}

const arrified = arg => (Array.isArray(arg) ? arg : [arg])

const taskQueue = createTaskQueue()     // 任务队列
let subTask = null                      // 要执行的子任务
let pendingCommit = null

// 这时候的fiber就是root，里面的effects包含了所有的fiber
const commitAllWork = fiber => {
  // 循环 effets 数组 构建 DOM 节点树
  fiber.effects.forEach(item => {
    if (item.tag === "class_component") {
      item.stateNode.__fiber = item
    }

    if (item.effectTag === "delete") {
      item.parent.stateNode.removeChild(item.stateNode)
    } else if (item.effectTag === "update") {
      if (item.type === item.alternate.type) {      // 节点类型相同
        updateNodeElement(item.stateNode, item, item.alternate)
      } else {                                      // 节点类型不同
        item.parent.stateNode.replaceChild(
          item.stateNode,
          item.alternate.stateNode
        )
      }
    } else if (item.effectTag === "placement") {
      let fiber = item                // 当前要追加的子节点
      let parentFiber = item.parent   // 当前要追加的子节点的父级
      /**
       * 找到普通节点父级 排除组件父级
       * 因为组件父级是不能直接追加真实DOM节点的
       */
      while (
        parentFiber.tag === "class_component" ||
        parentFiber.tag === "function_component"
      ) {
        parentFiber = parentFiber.parent
      }
      /**
       * 如果子节点是普通节点 找到父级 将子节点追加到父级中
       */
      if (fiber.tag === "host_component") {
        parentFiber.stateNode.appendChild(fiber.stateNode)
      }
    }
  })
  /**
   * 备份旧的 fiber 节点对象
   */
  fiber.stateNode.__rootFiberContainer = fiber
}

const getFirstTask = () => {
  const task = taskQueue.pop()

  if (task.from === "class_component") {
    const root = getRoot(task.instance)
    task.instance.__fiber.partialState = task.partialState
    return {
      props: root.props,
      stateNode: root.stateNode,
      tag: "host_root",
      effects: [],
      child: null,
      alternate: root
    }
  }

  /**
   * 返回最外层节点的fiber对象
   */
  return {
    props: task.props,
    stateNode: task.dom,      // 当前节点的DOM
    tag: "host_root",
    effects: [],
    child: null,
    alternate: task.dom.__rootFiberContainer
  }
}

const reconcileChildren = (fiber, children) => {
  // children 可能对象 也可能是数组, 将children 转换成数组
  const arrifiedChildren = arrified(children)
  let index = 0
  let numberOfElements = arrifiedChildren.length
  let element = null      // 循环过程中的循环项 就是子节点的 virtualDOM 对象
  let newFiber = null     // 子级 fiber 对象
  let prevFiber = null    // 上一个兄弟 fiber 对象
  let alternate = null    // 备份节点

  if (fiber.alternate && fiber.alternate.child) {
    // fiber.alternate.child就是children参数里面的第一个节点
    alternate = fiber.alternate.child
  }

  while (index < numberOfElements || alternate) {
    element = arrifiedChildren[index]  // 子级 virtualDOM 对象

    if (!element && alternate) {            // 1) 没有对应的新节点: 删除
      alternate.effectTag = "delete"
      fiber.effects.push(alternate)
    } else if (element && alternate) {      // 2) 新旧节点都存在：更新
      newFiber = {
        type: element.type,
        props: element.props,
        tag: getTag(element),
        effects: [],
        effectTag: "update",
        parent: fiber,
        alternate
      }
      if (element.type === alternate.type) {          // 2.1) 新旧节点类型相同，直接用旧节点
        newFiber.stateNode = alternate.stateNode
      } else {                                        // 2.2) 新旧节点类型不同，新建节点
        newFiber.stateNode = createStateNode(newFiber)
      }
    } else if (element && !alternate) {     // 3) 没有对应的旧节点：初始化
      newFiber = {
        type: element.type,
        props: element.props,
        tag: getTag(element),
        effects: [],
        effectTag: "placement",
        parent: fiber
      }
      newFiber.stateNode = createStateNode(newFiber)
    }

    if (index === 0) {
      fiber.child = newFiber
    } else if (element) {
      prevFiber.sibling = newFiber
    }

    if (alternate && alternate.sibling) {
      alternate = alternate.sibling
    } else {
      alternate = null
    }

    // 更新
    prevFiber = newFiber
    index++
  }
}

const executeTask = fiber => {
  /**
   * 构建子级fiber对象
   */
  if (fiber.tag === "class_component") {
    const { stateNode } = fiber;
    if (stateNode.__fiber && stateNode.__fiber.partialState) {
      stateNode.state = {
        ...stateNode.state,
        ...stateNode.__fiber.partialState
      }
    }

    reconcileChildren(fiber, fiber.stateNode.render())
  } else if (fiber.tag === "function_component") {
    reconcileChildren(fiber, fiber.stateNode(fiber.props))
  } else {
    reconcileChildren(fiber, fiber.props.children)
  }
  /**
   * 如果子级存在 返回子级
   * 将这个子级当做父级 构建这个父级下的子级
   */
  if (fiber.child) {
    return fiber.child
  }

  /**
   * 如果存在同级 返回同级 构建同级的子级
   * 如果同级不存在 返回到父级 看父级是否有同级
   */
  let curFiber = fiber
  while (curFiber.parent) {
    // 在循环的过程中不断收集fiber到effects数组中
    // 循环完了以后root的effects里面就会有所有的fiber对象
    curFiber.parent.effects = curFiber.parent.effects.concat(
      curFiber.effects.concat([curFiber])
    )
    if (curFiber.sibling) {
      return curFiber.sibling
    }
    curFiber = curFiber.parent
  }

  pendingCommit = curFiber
}

const workLoop = deadline => {
  /**
   * 如果子任务不存在 就去获取子任务
   */
  if (!subTask) {
    subTask = getFirstTask()
  }
  /**
   * 如果任务存在并且浏览器有空余时间就调用
   * executeTask 方法执行任务 接受任务 返回新的任务
   */
  while (subTask && deadline.timeRemaining() > 1) {
    subTask = executeTask(subTask)
  }

  if (pendingCommit) {
    commitAllWork(pendingCommit)
  }
}

const performTask = deadline => {
  /**
   * 执行任务
   */
  workLoop(deadline)
  /**
   * 判断任务是否存在
   * 判断任务队列中是否还有任务没有执行
   * 再一次告诉浏览器在空闲的时间执行任务
   */
  if (subTask || !taskQueue.isEmpty()) {
    requestIdleCallback(performTask)
  }
}

export const render = (element, dom) => {
  /**
   * 1. 向任务队列中添加任务
   * 2. 指定在浏览器空闲时执行任务
   */
  /**
   * 任务就是通过 vdom 对象 构建 fiber 对象
   */
  taskQueue.push({
    dom,                            // root node
    props: { children: element }
  })
  /**
   * 指定在浏览器空闲的时间去执行任务
   */
  requestIdleCallback(performTask)
}

export const scheduleUpdate = (instance, partialState) => {
  taskQueue.push({
    from: "class_component",
    instance,
    partialState
  })
  requestIdleCallback(performTask)
}
