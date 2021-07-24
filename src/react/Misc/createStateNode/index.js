import { createDOMElement } from '../../DOM';

// 为fiber节点添加DOM对象或组件实例对象
const createStateNode = fiber => (
  fiber.tag === 'host_component'
    ? createDOMElement(fiber)
    : createReactInstance(fiber)
);

const createReactInstance = fiber => (
  fiber.tag === 'class_component'
    ? new fiber.type(fiber.props)
    : fiber.type
);

export default createStateNode;
