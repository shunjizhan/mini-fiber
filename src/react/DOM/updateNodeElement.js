// 可以用来设置属性或者更新属性。
// 设置属性的时候oldvdom为空
export default function updateNodeElement(
  newElement,
  vdom,
  oldvdom = {}
) {
  // 获取节点对应的属性对象
  const newProps = vdom.props || {}
  const oldProps = oldvdom.props || {}

  if (vdom.type === "text") {
    if (newProps.textContent !== oldProps.textContent) {
      const newNode = document.createTextNode(newProps.textContent)
      const parentStateNode = vdom.parent.stateNode;
      const parentsAreSameType = vdom.parent.type !== oldvdom.parent.type

      if (parentsAreSameType) {
        parentStateNode.appendChild(newNode)
      } else {
        parentStateNode.replaceChild(newNode, oldvdom.stateNode)
      }
    }
    return
  }

  Object.keys(newProps).forEach(propName => {
    const newPropsValue = newProps[propName]
    const oldPropsValue = oldProps[propName]

    if (newPropsValue !== oldPropsValue) {
      // 判断属性是否是否事件属性 onClick -> click
      if (propName.slice(0, 2) === "on") {
        const eventName = propName.toLowerCase().slice(2)
        newElement.addEventListener(eventName, newPropsValue)
        if (oldPropsValue) {    // 删除原有的事件的事件处理函数
          newElement.removeEventListener(eventName, oldPropsValue)
        }
      } else if (propName === "value" || propName === "checked") {
        newElement[propName] = newPropsValue
      } else if (propName !== "children") {
        if (propName === "className") {
          newElement.setAttribute("class", newPropsValue)
        } else {
          newElement.setAttribute(propName, newPropsValue)
        }
      }
    }
  })

  // 判断属性被删除的情况
  Object.keys(oldProps).forEach(propName => {
    const newPropsValue = newProps[propName]
    const oldPropsValue = oldProps[propName]

    if (!newPropsValue) {
      // 属性被删除了
      if (propName.slice(0, 2) === "on") {
        const eventName = propName.toLowerCase().slice(2)
        newElement.removeEventListener(eventName, oldPropsValue)
      } else if (propName !== "children") {
        newElement.removeAttribute(propName)
      }
    }
  })
}
