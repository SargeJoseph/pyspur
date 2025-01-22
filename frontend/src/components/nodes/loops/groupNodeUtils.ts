import { type Node, type NodeOrigin, type Rect, Box, Edge } from '@xyflow/react'
// @todo import from @xyflow/react when fixed
import { boxToRect, getNodePositionWithOrigin, rectToBox } from '@xyflow/system'
import { Dispatch } from '@reduxjs/toolkit'
import { updateNodeParentAndCoordinates } from '../../../store/flowSlice'
// Add MouseEvent from React
import { MouseEvent as ReactMouseEvent } from 'react'
import { FlowWorkflowNodeTypesByCategory } from '@/store/nodeTypesSlice'
import { createNode } from '@/utils/nodeFactory'
import { AppDispatch } from '@/store/store'
import { addNodeWithConfig } from '@/store/flowSlice'

export const GROUP_NODE_TYPES = ['ForLoopNode']

// we have to make sure that parent nodes are rendered before their children
export const sortNodes = (a: Node, b: Node): number => {
    if (a.type === b.type) {
        return 0
    }
    return a.type === 'group' && b.type !== 'group' ? -1 : 1
}

export const getId = (prefix = 'node') => `${prefix}_${Math.random() * 10000}`

export const getNodePositionInsideParent = (node: Partial<Node>, groupNode: Node) => {
    const position = node.position ?? { x: 0, y: 0 }
    const nodeWidth = node.measured?.width ?? 0
    const nodeHeight = node.measured?.height ?? 0
    const groupWidth = groupNode.measured?.width ?? 0
    const groupHeight = groupNode.measured?.height ?? 0

    const newPosition = {
        x: position.x,
        y: position.y,
    }

    if (position.x < groupNode.position.x) {
        newPosition.x = 0
    } else if (position.x + nodeWidth > groupNode.position.x + groupWidth) {
        newPosition.x = groupWidth - nodeWidth
    } else {
        newPosition.x = position.x - groupNode.position.x
    }

    if (position.y < groupNode.position.y) {
        newPosition.y = 0
    } else if (position.y + nodeHeight > groupNode.position.y + groupHeight) {
        newPosition.y = groupHeight - nodeHeight
    } else {
        newPosition.y = position.y - groupNode.position.y
    }

    return newPosition
}

export const getBoundsOfBoxes = (box1: Box, box2: Box): Box => ({
    x: Math.min(box1.x, box2.x),
    y: Math.min(box1.y, box2.y),
    x2: Math.max(box1.x2, box2.x2),
    y2: Math.max(box1.y2, box2.y2),
})

export const getRelativeNodesBounds = (nodes: Node[], nodeOrigin: NodeOrigin = [0, 0]): Rect => {
    if (nodes.length === 0) {
        return { x: 0, y: 0, width: 300, height: 150 }
    }

    const box = nodes.reduce(
        (currBox, node) => {
            const { x, y } = getNodePositionWithOrigin(node, nodeOrigin)
            return getBoundsOfBoxes(
                currBox,
                rectToBox({
                    x,
                    y,
                    width: node.width || 0,
                    height: node.height || 0,
                })
            )
        },
        { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity }
    )

    return boxToRect(box)
}

export const onNodeDragOverGroupNode = (
    event: ReactMouseEvent,
    node: Node,
    nodes: Node[],
    dispatch: Dispatch,
    getIntersectingNodes: (node: Node) => Node[],
    getNodes: () => Node[],
    updateNode
) => {
    // Skip if node is already in a group or is a group itself
    if (GROUP_NODE_TYPES.includes(node.type) || node.parentId) {
        return
    }

    // Get intersecting group nodes
    const intersections = getIntersectingNodes(node).filter((n) => GROUP_NODE_TYPES.includes(n.type))
    const groupNode = intersections[0]

    // Add visual feedback for potential group drop
    const groupClassName = intersections.length ? 'active' : ''

    // // Update nodes in Redux store
    // nodes.forEach((n) => {
    //     if (GROUP_NODE_TYPES.includes(n.type)) {
    //         dispatch(
    //             updateNodeDataOnly({
    //                 id: n.id,
    //                 data: {
    //                     ...n.data,
    //                     className: groupClassName,
    //                 },
    //             })
    //         )
    //     }
    // })
}

export const onNodeDragStopOverGroupNode = (
    event: ReactMouseEvent,
    node: Node,
    nodes: Node[],
    edges: Edge[],
    dispatch: Dispatch,
    getIntersectingNodes: (node: Node) => Node[],
    getNodes: () => Node[],
    updateNode
) => {
    // Skip if node is already in a group or is a group itself
    if (GROUP_NODE_TYPES.includes(node.type) || node.parentId) {
        return
    }

    // Get intersecting group nodes
    const intersections = getIntersectingNodes(node).filter((n) => GROUP_NODE_TYPES.includes(n.type))
    const groupNode = intersections[0]

    if (!intersections.length || !groupNode) {
        return
    }

    // Check if node is connected to group node through any path and skip if true
    const isConnectedToGroupNode = (() => {
        // Check predecessors (sources)
        const checkPredecessors = (currentId: string, visited = new Set<string>()): boolean => {
            if (visited.has(currentId)) return false
            visited.add(currentId)

            const incomingEdges = edges.filter((e) => e.target === currentId)
            return incomingEdges.some((e) => {
                if (e.source === groupNode.id) return true
                return checkPredecessors(e.source, visited)
            })
        }

        // Check successors (targets)
        const checkSuccessors = (currentId: string, visited = new Set<string>()): boolean => {
            if (visited.has(currentId)) return false
            visited.add(currentId)

            const outgoingEdges = edges.filter((e) => e.source === currentId)
            return outgoingEdges.some((e) => {
                if (e.target === groupNode.id) return true
                return checkSuccessors(e.target, visited)
            })
        }

        return checkPredecessors(node.id) || checkSuccessors(node.id)
    })()
    if (isConnectedToGroupNode) {
        return
    }

    // If there's an intersection and node isn't already in this group
    if (node.parentId !== groupNode?.id) {
        // Calculate new position relative to parent
        const position = getNodePositionInsideParent(node, groupNode) ?? {
            x: 0,
            y: 0,
        }

        // Update the dragged node in Redux store
        dispatch(
            updateNodeParentAndCoordinates({
                nodeId: node.id,
                parentId: groupNode.id,
                position,
            })
        )
        updateNode(node.id, {
            parentId: groupNode.id,
            position,
            extent: 'parent',
            expandParent: true,
        })

        // // Clear group node highlighting
        // dispatch(
        //     updateNodeDataOnly({
        //         id: groupNode.id,
        //         data: {
        //             ...groupNode.data,
        //             className: '',
        //         },
        //     })
        // )
    }
}

export const createDynamicGroupNodeWithChildren = (
    nodeTypes: FlowWorkflowNodeTypesByCategory,
    nodeType: string,
    id: string,
    position: { x: number; y: number },
    dispatch: AppDispatch
) => {
    const loopNodeAndConfig = createNode(nodeTypes, nodeType, id, position, null, { width: 1200, height: 600 })

    if (loopNodeAndConfig) {
        // Set initial dimensions for the loop node

        // Create input node
        const inputNodeAndConfig = createNode(
            nodeTypes,
            'InputNode',
            `${id}_input`,
            {
                x: position.x + 50,
                y: position.y + 300, // position.y + (height/2)
            },
            loopNodeAndConfig.node.id
        )

        // Create output node
        const outputNodeAndConfig = createNode(
            nodeTypes,
            'OutputNode',
            `${id}_output`,
            {
                x: position.x + 950, // position.x + width - 250
                y: position.y + 300, // position.y + (height/2)
            },
            loopNodeAndConfig.node.id
        )

        // Dispatch all nodes
        dispatch(addNodeWithConfig(loopNodeAndConfig))
        dispatch(addNodeWithConfig(inputNodeAndConfig))
        dispatch(addNodeWithConfig(outputNodeAndConfig))
        return true
    }
    return false
}
